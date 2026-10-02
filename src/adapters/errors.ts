/** 适配器明确知道失败原因时抛这个，不再退回通用模式（例如在 X 时间线上没指定推文） */
export class AdapterError extends Error {}
