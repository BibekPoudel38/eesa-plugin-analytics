// Device/browser/OS detection, checked against real user-agent strings.
// These are pure string checks with no build step, so the test simply pulls the
// sniffing block straight out of the shipped tracker and runs it against a
// table of real UAs — no bundler, no dependencies, no drift between what is
// tested and what customers actually load.
//
// Run with: npm test

const fs=require('fs');
const src=fs.readFileSync('public/eesa-analytics.js','utf8');
const block=src.slice(src.indexOf('var ua = navigator.userAgent;'), src.indexOf('function meta()'));
function make(uaStr, touch){
  const navigator={userAgent:uaStr, maxTouchPoints:touch};
  const f=new Function('navigator', block + '; return {device:device(),browser:browser(),os:os()};');
  return f(navigator);
}
const CASES=[
 ['iPhone Safari','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',5,'Mobile','Safari','iOS'],
 ['iPhone Chrome','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',5,'Mobile','Chrome','iOS'],
 ['iPhone Firefox','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',5,'Mobile','Firefox','iOS'],
 ['iPhone Edge','Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/126.0 Mobile/15E148 Safari/605.1.15',5,'Mobile','Edge','iOS'],
 ['iPad (old UA)','Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',5,'Tablet','Safari','iOS'],
 ['iPadOS 13+ (Mac UA)','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',5,'Tablet','Safari','iOS'],
 ['real Mac Safari','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',0,'Desktop','Safari','macOS'],
 ['real Mac Chrome','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',0,'Desktop','Chrome','macOS'],
 ['Android Chrome','Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',5,'Mobile','Chrome','Android'],
 ['Samsung Internet','Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36',5,'Mobile','Samsung Internet','Android'],
 ['Android Firefox','Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',5,'Mobile','Firefox','Android'],
 ['Windows Chrome','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',0,'Desktop','Chrome','Windows'],
];
let pass=0,fail=0;
for (const [name,ua,touch,eD,eB,eO] of CASES){
  const r=make(ua,touch);
  const ok = r.device===eD && r.browser===eB && r.os===eO;
  ok?pass++:fail++;
  console.log(`  ${ok?'PASS':'FAIL'}  ${name.padEnd(20)} -> ${r.device}/${r.browser}/${r.os}${ok?'':`   EXPECTED ${eD}/${eB}/${eO}`}`);
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
