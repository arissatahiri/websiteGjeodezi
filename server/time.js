const TZ = "Europe/Belgrade";

function partsInTz(date = new Date(), timeZone = TZ) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return map;
}

function todayStr(date = new Date()) {
  const p = partsInTz(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function nowLabel(date = new Date()) {
  const p = partsInTz(date);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    weekday: p.weekday,
    timezone: TZ,
  };
}

module.exports = { TZ, todayStr, nowLabel, partsInTz };
