// String型かの判定
export const isString = (value: any) => {
  return typeof value === "string" || value instanceof String ? true : false;
};
