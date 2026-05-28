// Quick concurrency check: send N concurrent validate requests
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '200', 10);
const API = process.env.API_URL || 'http://localhost:5000';

function ticketId(n){ return `TICKET_${n % 100000}_2026WC`; }

async function one(n){
  try{
    const res = await fetch(`${API}/api/fifa/ticket/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: ticketId(n), userId: `check_${n}` }),
    });
    return res.status;
  }catch(e){
    return 0;
  }
}

(async ()=>{
  console.log(`Running ${CONCURRENCY} concurrent requests against ${API}`);
  const t0 = Date.now();
  const ps = [];
  for(let i=0;i<CONCURRENCY;i++) ps.push(one(i));
  const results = await Promise.all(ps);
  const ok = results.filter(s => s===200 || s===401).length;
  const srvErr = results.filter(s=>s===503).length;
  const other = results.length - ok - srvErr;
  const pct = ((ok/results.length)*100).toFixed(1);
  console.log(`Success: ${ok}/${results.length} (${pct}%) 503: ${srvErr}  other: ${other}`);
  console.log(`Elapsed ms: ${Date.now()-t0}`);
})();
