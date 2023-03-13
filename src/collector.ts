import { Subtitle } from "./types";
import { isString } from "./utils/text";
import { sleep } from "./utils/time";

// レクチャーのデータを取得する
const fetchLectureData = async (
  courseId: string,
  lectureId: string
): Promise<any> => {
  let access_token = getCookie("access_token");
  let bearer_token = `Bearer ${access_token}`;
  // 引数を渡さなかった（空文字の）場合は、現在のレクチャーとして扱われます
  return fetch(getLectureDataUrl(courseId, lectureId), {
    headers: {
      "x-udemy-authorization": bearer_token,
      authorization: bearer_token,
    },
  }).then((res) => res.json());
};

// 指定された名前のCookieの値を返します。
// https://stackoverflow.com/questions/5639346/what-is-the-shortest-function-for-reading-a-cookie-by-name-in-javascript
const getCookie = (name: string): string => {
  return (document.cookie.match(
    "(?:^|;)\\s*" + name.trim() + "\\s*=\\s*([^;]*?)\\s*(?:;|$)"
  ) || [])[1];
};

// 個別レクチャーのデータURL
// パラメータを渡すかどうかは自由ですが、
// 引数を渡さなかった場合は、現在のレクチャーとして扱われます
const getLectureDataUrl = (
  paramCourseId: string = "",
  paramLectureId: string = ""
) => {
  const courseId = paramCourseId; // HTMLから現在表示しているコースのcourseIdを取得
  const lectureId = paramLectureId; // URLからlectureIdを取得
  const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/${courseId}/lectures/${lectureId}/?fields[lecture]=asset,description,download_url,is_free,last_watched_second&fields[asset]=asset_type,length,media_license_token,media_sources,captions,thumbnail_sprite,slides,slide_urls,download_urls`;
  return url;
};

// https://greasyfork.org/en/scripts/422576-udemy-subtitles-downloader-v3/discussions/110421
const getArgsLectureId = () => {
  const result = /(?<=lecture\/)\d*/.exec(document.URL);
  if (!result) return;
  return result[0];
};

// コースIDを取得する
const fetchArgsCourseId = async (tabId: number): Promise<string> => {
  const json = await getArgs(tabId);
  return json.courseId;
};

// パラメータの取得
// HTMLのDOMのdata-module-args属性のJSONを返す
const getArgs = async (tabId: number) => {
  const result = await chrome.scripting.executeScript({
    target: {
      tabId: tabId,
    },
    func: () => {
      const ud_app_loader = document.querySelector(".ud-app-loader");
      if (!ud_app_loader || !(ud_app_loader as any).dataset)
        throw Error("ud_app_loader or ud_app_loader.dataset is null");
      const args = (ud_app_loader as any).dataset.moduleArgs;
      const json = JSON.parse(args);
      return json;
    },
  });

  if (result.length > 0) {
    return result[0].result;
  } else {
    null;
  }
};

/// コース全体のデータを取得する
const fetchCourseData = async (tabId: number): Promise<any> => {
  // Udemyでログイン済みのブラウザで実行していることが条件
  let access_token = getCookie("access_token");
  let bearer_token = `Bearer ${access_token}`;
  // getCourseDataUrl: Udemy apiからコース全体のデータURLを取得する
  const courceDataUrl = await getCourseDataUrl(tabId);
  return fetch(courceDataUrl, {
    headers: {
      "x-udemy-authorization": bearer_token,
      authorization: bearer_token,
    },
  }).then((response) => response.json());
};

// コース全体のデータ URL
const getCourseDataUrl = async (tabId: number) => {
  let courseId = await fetchArgsCourseId(tabId);
  let url = `https://www.udemy.com/api-2.0/courses/${courseId}/subscriber-curriculum-items/?page_size=1400&fields[lecture]=title,object_index,is_published,sort_order,created,asset,supplementary_assets,is_free&fields[quiz]=title,object_index,is_published,sort_order,type&fields[practice]=title,object_index,is_published,sort_order&fields[chapter]=title,object_index,is_published,sort_order&fields[asset]=title,filename,asset_type,status,time_estimation,is_external&caching_intent=True`;
  return url;
};

// テキスト形式のvttを{ from, to, subtitle }型の構造化されたものに変換する
const convertToStructuredVtt = (vtt: string) => {
  let formatVtt = vtt.replace(/\n\n\d+\n/g, "\n\n");

  let doubleFlag = false;
  let tsFlag = false;
  formatVtt =
    formatVtt
      .split("")
      .filter((char: string, i: number) => {
        if (formatVtt[i + 1] === "\n" && formatVtt[i + 2] === "\n") {
          // ワンセットの終了
          doubleFlag = false;
          tsFlag = false;
        } else if (char === "\n") {
          if (formatVtt[i + 1] === "\n") {
            // 文字列で\n\nが現れた
            doubleFlag = true;
          } else if (doubleFlag && !tsFlag) {
            if (formatVtt[i - 1] === "\n") {
              // 現在のcharが\n\nの後ろの\n
            } else {
              // ts直後の\n
              tsFlag = true;
            }
          } else {
            // 不要な\n
            return false;
          }
        }
        return true;
      })
      .join("") + "\n";

  const subtitles = [];

  const regexWithHour =
    /(\d{2}):(\d{2}):(\d{2}).(\d{3}) --> (\d{2}):(\d{2}):(\d{2}).(\d{3})\n(.*)\n/g;
  let match;
  while ((match = regexWithHour.exec(formatVtt))) {
    subtitles.push({
      from: `${match[1]}:${match[2]}:${match[3]}.${match[4]}`,
      to: `${match[5]}:${match[6]}:${match[7]}.${match[8]}`,
      subtitle: match[9].trim(),
    });
  }

  if (subtitles.length === 0) {
    const regexWithoutHour =
      /(\d{2}):(\d{2}).(\d{3}) --> (\d{2}):(\d{2}).(\d{3})\n(.*)\n/g;
    let match;
    while ((match = regexWithoutHour.exec(formatVtt))) {
      subtitles.push({
        from: `00:${match[1]}:${match[2]}.${match[3]}`,
        to: `00:${match[4]}:${match[5]}.${match[6]}`,
        subtitle: match[7].trim(),
      });
    }
  }

  return subtitles;
};

export const downloadAllVttData = async (tabId: number) => {
  const courseId = await fetchArgsCourseId(tabId); // URLからコースIDを取得
  const courseData = await fetchCourseData(tabId); // URLから取得したコースIDとCookieから取得した認証情報を元にコース全体のデータを取得する

  const lectures = courseData.results.filter(
    (result: any) => result._class === "lecture"
  ); // chapter, lecture等が入った配列
  await sleep(1000);
  for (const lecture of lectures) {
    const lectureId = lecture.id;
    // 引数を渡さなかった（空文字の）場合は、現在のレクチャーとして扱われます
    const lectureData = await fetchLectureData(courseId, lectureId); // 現在のレクチャーのデータを取得する
    await sleep(1000);

    // 複数の言語の字幕データが入ってくるので、data.asset.captions.lengthが1以上になることもある
    const targetLangs = ["英語", "英語 [自動]"];
    const captions = targetLangs
      .map((lang) =>
        lectureData.asset.captions.find(
          (caption: any) => caption.video_label === lang
        )
      )
      .filter(Boolean);
    if (captions.length === 0) {
      // 英語字幕が存在しないレクチャー
      continue;
    }

    // 字幕データのダウンロード
    const url = captions.map((c) => c.url)[0];
    const vtt = await fetch(url).then((res) => res.text());
    const structuredVtt = convertToStructuredVtt(vtt);
    // バリデーション
    validateVtt(structuredVtt);

    downloadJson(structuredVtt, `en-${courseId}-${lectureId}.json`);
  }
};

export const downloadCurrentLectureVtt = async (
  tabId: number,
  lectureId: string
) => {
  const courseId = await fetchArgsCourseId(tabId);
  const lectureData = await fetchLectureData(courseId, lectureId); // 現在のレクチャーのデータを取得する

  // 複数の言語の字幕データが入ってくるので、data.asset.captions.lengthが1以上になることもある
  const targetLangs = ["英語", "英語 [自動]"];
  const captions = targetLangs
    .map((lang) =>
      lectureData.asset.captions.find(
        (caption: any) => caption.video_label === lang
      )
    )
    .filter(Boolean);
  if (captions.length === 0) {
    // 英語字幕が存在しないレクチャー
    return;
  }

  // 字幕データのダウンロード
  const urls = captions.map((c) => c.url);
  const url = urls[0];
  const vtt = await fetch(url).then((res) => res.text());
  const structuredVtt = convertToStructuredVtt(vtt);
  // バリデーション
  validateVtt(structuredVtt);

  downloadJson(structuredVtt, `en-${courseId}-${lectureId}.json`);
};

const downloadJson = (data: any, filename: string) => {
  const jsonString = JSON.stringify(data);
  const blob = new Blob([jsonString], { type: "application/json" });
  const a = document.createElement("a");
  a.download = filename;
  a.href = URL.createObjectURL(blob);
  a.dispatchEvent(new MouseEvent("click"));
};

const validateVtt = (vtt: Subtitle[]) => {
  vtt.forEach(({ from, to, subtitle }) => {
    const isOk =
      (from.match(/^\d{2}\:\d{2}\:\d{2}\.\d{3}$/) ||
        from.match(/^\d{2}\:\d{2}\.\d{3}$/)) &&
      (to.match(/^\d{2}\:\d{2}\:\d{2}\.\d{3}$/) ||
        to.match(/^\d{2}\:\d{2}\.\d{3}$/)) &&
      subtitle &&
      isString(subtitle);
    if (!isOk) {
      console.log("該当箇所", { from, to, subtitle });
      throw Error("正しくvttを構造化出来ていない");
    } else return isOk;
  });
};
