export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作未完成，請重試';
export const dateTime = (value: string) => new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));
