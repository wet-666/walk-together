const CHINA_TZ = "Asia/Shanghai";

function chinaDay(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function formatChatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  if (chinaDay(date) === chinaDay(new Date())) {
    return time;
  }
  const md = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TZ,
    month: "numeric",
    day: "numeric",
  }).format(date);
  return `${md} ${time}`;
}
