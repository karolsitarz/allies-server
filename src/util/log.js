console.DLog = (...msg) => {
  const d = new Date();
  const h = d.getHours() < 10 ? `0${d.getHours()}` : d.getHours();
  const m = d.getMinutes() < 10 ? `0${d.getMinutes()}` : d.getMinutes();
  const s = d.getSeconds() < 10 ? `0${d.getSeconds()}` : d.getSeconds();
  console.log(`[${h}:${m}:${s}] `, msg.join('\t'));
};
