import React from "react";
import ReactDOM from "react-dom";
import { Button, Box, Heading } from "@chakra-ui/react";
import { ChakraProvider } from "@chakra-ui/react";
import { downloadAllVttData, downloadCurrentLectureVtt } from "./collector";

const Popup = () => {
  const handleDownloadAllVtt = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const activeTab = tabs[0];
      const tabId = activeTab.id;
      if (typeof tabId !== "number") {
        return;
      }
      downloadAllVttData(tabId);
    });
  };

  const handleDownloadCurrentLectureVtt = () => {
    // URLからlectureIdを取得する
    chrome.tabs.query(
      { active: true, currentWindow: true },
      async function (tabs) {
        const activeTab = tabs[0];
        const url = activeTab.url;
        const tabId = activeTab.id;
        if (!url) {
          return;
        }
        const result = url.match(/lecture\/(\d+)/);
        if (result && result.length >= 1) {
          const lectureId = result[1];

          if (typeof tabId !== "number") {
            return;
          }

          downloadCurrentLectureVtt(tabId, lectureId);
        }
      }
    );
  };

  return (
    <ChakraProvider>
      <Box w="540px">
        <Box bg="#4299E1" w="100%" p={4} color="white">
          <Heading as="h3" size="xl" isTruncated>
            Udemy subtitles collctor
          </Heading>
        </Box>
        <Box pb={2} pl={4} pr={4}>
          <Button
            mt={2}
            bg="#4299E1"
            color="white"
            type="button"
            onClick={handleDownloadAllVtt}
          >
            全てのレクチャーの字幕を取得する
          </Button>
          <Button
            mt={2}
            bg="#4299E1"
            color="white"
            type="button"
            onClick={handleDownloadCurrentLectureVtt}
          >
            現在のレクチャーの字幕を取得する
          </Button>
        </Box>
      </Box>
    </ChakraProvider>
  );
};

ReactDOM.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
  document.getElementById("root")
);
