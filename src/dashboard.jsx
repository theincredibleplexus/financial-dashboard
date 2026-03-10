import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, ReferenceLine, AreaChart, Area, Cell, LineChart } from "recharts";
import { fetchCSV, processUpBank, processPayPal, processGateway, processCommSec } from "./dataLoader.js";

// ─── SHARED ──────────────────────────────────────────────────────────────────
const fmt=v=>`$${Math.abs(v).toLocaleString()}`;
const fmtK=v=>{const a=Math.abs(v);return(a>=1000?`${v<0?"-":""}$${(a/1000).toFixed(a>=10000?0:1)}k`:`$${v}`);};
const Tip=({active,payload,label})=>{if(!active||!payload)return null;return(<div style={{background:"#111127",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 14px"}}><div style={{color:"#94a3b8",marginBottom:5,fontWeight:600,fontSize:12,textTransform:"uppercase"}}>{label}</div>{payload.filter(p=>p.value!==0&&p.value!==null).map((p,i)=>(<div key={i} style={{color:p.color||"#e2e8f0",display:"flex",justifyContent:"space-between",gap:20,lineHeight:1.7,fontSize:13}}><span>{p.name}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{typeof p.value==='number'&&Math.abs(p.value)>=1000?`$${Math.abs(p.value).toLocaleString()}`:fmt(p.value)}</span></div>))}</div>);};
const St=({label,value,sub,accent="#60a5fa",small})=>(<div style={{background:"linear-gradient(145deg,rgba(255,255,255,0.035) 0%,rgba(255,255,255,0.008) 100%)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:small?"11px 13px":"14px 18px",flex:1,minWidth:small?85:115}}><div style={{color:"#64748b",fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:4}}>{label}</div><div style={{color:accent,fontSize:small?15:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.1}}>{value}</div>{sub&&<div style={{color:"#475569",fontSize:11,marginTop:3}}>{sub}</div>}</div>);
const Sec=({children,icon})=>(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,marginTop:24}}><span style={{fontSize:15}}>{icon}</span><h2 style={{margin:0,fontSize:14,fontWeight:700,color:"#e2e8f0"}}>{children}</h2><div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(255,255,255,0.07),transparent)"}}/></div>);
const Ch=({children,height})=>(<div style={{background:"rgba(255,255,255,0.015)",borderRadius:14,border:"1px solid rgba(255,255,255,0.045)",padding:"12px 6px 6px"}}><ResponsiveContainer width="100%" height={height||200}>{children}</ResponsiveContainer></div>);
const Lg=({items})=>(<div style={{display:"flex",justifyContent:"center",gap:11,padding:"5px 0",fontSize:11,flexWrap:"wrap"}}>{items.map(([l,c])=>(<div key={l} style={{display:"flex",alignItems:"center",gap:3,color:"#94a3b8"}}><div style={{width:5,height:5,borderRadius:2,background:c}}/>{l}</div>))}</div>);
const Note=({color,children})=>(<div style={{marginTop:7,padding:9,borderRadius:8,background:`${color}08`,border:`1px solid ${color}15`,fontSize:12,color:"#94a3b8",lineHeight:1.5}}>{children}</div>);
const Row=({label,value,color,bold,note,borderTop})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:bold?"8px 0":"4px 0",borderTop:borderTop?"1px solid rgba(255,255,255,0.06)":"none",marginTop:borderTop?4:0}}><span style={{fontSize:13,color:bold?"#e2e8f0":"#94a3b8",fontWeight:bold?700:400}}>{label}{note&&<span style={{fontSize:10,color:"#475569",marginLeft:6}}>{note}</span>}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:bold?15:13,fontWeight:bold?700:600,color:color||"#cbd5e1"}}>{value}</span></div>);
const Badge=({text,color})=>(<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:`${color}15`,color,whiteSpace:"nowrap"}}>{text}</span>);
const Card=({label,value,type,detail})=>(<div style={{padding:"9px 11px",borderRadius:10,background:type==="in"?"rgba(52,211,153,0.04)":"rgba(248,113,113,0.04)",border:`1px solid ${type==="in"?"rgba(52,211,153,0.08)":"rgba(248,113,113,0.08)"}`}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:600,color:"#cbd5e1"}}>{label}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:13,color:type==="in"?"#34d399":"#f87171"}}>{type==="in"?"+":"−"}{value}</span></div><div style={{fontSize:10,color:"#475569",marginTop:2}}>{detail}</div></div>);
const xP={tick:{fill:"#64748b",fontSize:11},axisLine:{stroke:"rgba(255,255,255,0.05)"}};
const yP={tickFormatter:fmtK,tick:{fill:"#64748b",fontSize:10},axisLine:false,tickLine:false};
const gd=<CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)"/>;

// ─── ALL DATA ────────────────────────────────────────────────────────────────
const pnlHC=[{m:"Jul",i:12642,s:22461,n:-9820},{m:"Aug",i:13082,s:22314,n:-9233},{m:"Sep",i:10373,s:19956,n:-9583},{m:"Oct",i:13421,s:15201,n:-1780},{m:"Nov",i:14007,s:21572,n:-7566},{m:"Dec",i:10708,s:15419,n:-4712},{m:"Jan",i:12437,s:18972,n:-6535},{m:"Feb",i:10558,s:13667,n:-3110}];
const cdHC=[{m:"Jul",a:2306,p:1443},{m:"Aug",a:1048,p:1840},{m:"Sep",a:712,p:1448},{m:"Oct",a:482,p:1987},{m:"Nov",a:1501,p:1886},{m:"Dec",a:793,p:457},{m:"Jan",a:810,p:0},{m:"Feb",a:320,p:0}];
const amzHC=[{m:"Jul",v:2306},{m:"Aug",v:1048},{m:"Sep",v:712},{m:"Oct",v:482},{m:"Nov",v:1501},{m:"Dec",v:793},{m:"Jan",v:810},{m:"Feb",v:320}];
const foodHC=[{m:"Jul",r:479,t:175,g:41},{m:"Aug",r:409,t:266,g:49},{m:"Sep",r:210,t:259,g:132},{m:"Oct",r:242,t:278,g:154},{m:"Nov",r:282,t:326,g:107},{m:"Dec",r:840,t:146,g:255},{m:"Jan",r:645,t:387,g:130},{m:"Feb",r:549,t:112,g:31}];
const hmHC=[{m:"Jul",rec:1487,one:0,mc:380},{m:"Aug",rec:3298,one:250,mc:1469},{m:"Sep",rec:1723,one:3836,mc:926},{m:"Oct",rec:698,one:137,mc:486},{m:"Nov",rec:1413,one:140,mc:458},{m:"Dec",rec:499,one:0,mc:0},{m:"Jan",rec:1477,one:0,mc:228},{m:"Feb",rec:1974,one:0,mc:357}];
const hcatsHC=[{n:"Vision",t:3056,c:"#06b6d4",no:"Done"},{n:"Pharmacy",t:2702,c:"#f97316",no:"→Ozempic"},{n:"Mental Health",t:2365,c:"#ec4899",no:"Psych 1x/mo"},{n:"GP",t:1901,c:"#8b5cf6"},{n:"Physio",t:1580,c:"#22c55e"},{n:"Surgery",t:5642,c:"#ef4444",no:"Done"}];
const tolls=[{m:"Jul",v:417},{m:"Aug",v:502},{m:"Sep",v:164},{m:"Oct",v:602},{m:"Nov",v:263},{m:"Dec",v:502},{m:"Jan",v:0},{m:"Feb",v:804}];
const glob=[{m:"Jul",v:101},{m:"Aug",v:201},{m:"Sep",v:170},{m:"Oct",v:77},{m:"Nov",v:120},{m:"Dec",v:139},{m:"Jan",v:224},{m:"Feb",v:138}];
const cc=[{n:"Rent (Ray)",a:1736,no:"Safiye $1,740"},{n:"Mortgage (main)",a:1792,no:"Interest"},{n:"Mortgage (top-up)",a:227,no:"IO 6.06%"},{n:"Personal Commitment",a:900},{n:"Inv. Property",a:397},{n:"GloBird",a:146},{n:"Internet",a:164},{n:"Telstra",a:39},{n:"Car Insurance",a:90},{n:"Pilot",a:25},{n:"Subs (monthly)",a:247},{n:"Subs (annual)",a:62}];
const sm=[{n:"Buddy Telco",c:104,t:"e",no:"Internet"},{n:"Tangerine",c:60,t:"e",no:"Tassie"},{n:"Telstra",c:39,t:"e",no:"Mobile"},{n:"Patreon",c:18,t:"d",no:"3 creators"},{n:"Claude AI",c:17,t:"e"},{n:"Spotify",c:7,t:"d",no:"Student"},{n:"Apple iCloud",c:1.5,t:"e"}];
const sa=[{n:"Pilot",c:147,f:"Qtr",mo:25,t:"e"},{n:"No-IP",c:207,f:"Annual",mo:17,t:"r"},{n:"Crazy Domains",c:200,f:"Jun",mo:17,t:"r"},{n:"Grammarly",c:115,f:"Dec",mo:10,t:"p"},{n:"Oura",c:110,f:"Dec",mo:9,t:"d"},{n:"QuillBot",c:90,f:"Dec",mo:8,t:"p"},{n:"Prime",c:79,f:"Annual",mo:7,t:"d"},{n:"Bitwarden",c:16,f:"Jul",mo:1,t:"e"}];
const ppCatsHC=[{n:"Vehicle (Jeep)",t:3549,ct:5,c:"#ef4444"},{n:"Tech",t:3978,ct:7,c:"#6366f1"},{n:"Harley/Moto",t:1789,ct:4,c:"#f97316"},{n:"Fitness",t:1729,ct:2,c:"#22c55e"},{n:"eBay",t:1383,ct:5,c:"#eab308"},{n:"Events+Travel",t:1152,ct:4,c:"#ec4899"},{n:"Other",t:3583,ct:10,c:"#94a3b8"}];
const ppMHC=[{m:"Jul",pi4:1043,p:6597},{m:"Aug",pi4:1840,p:1003},{m:"Sep",pi4:1297,p:1032},{m:"Oct",pi4:1987,p:2639},{m:"Nov",pi4:1886,p:989},{m:"Dec",pi4:457,p:1049},{m:"Jan",pi4:0,p:351},{m:"Feb",pi4:0,p:1789}];
const sdr=[{m:"Jul",inv:0,sav:0,oth:1050},{m:"Aug",inv:0,sav:5445,oth:0},{m:"Sep",inv:4740,sav:1940,oth:0},{m:"Oct",inv:1473,sav:290,oth:18},{m:"Nov",inv:2285,sav:827,oth:300},{m:"Dec",inv:3049,sav:0,oth:200},{m:"Jan",inv:3010,sav:0,oth:0},{m:"Feb",inv:6905,sav:376,oth:5000}];
const saf=[{m:"Jul",rent:1740,o:1620},{m:"Aug",rent:1740,o:540},{m:"Sep",rent:1740,o:-490},{m:"Oct",rent:1740,o:1780},{m:"Nov",rent:1740,o:3360},{m:"Dec",rent:1740,o:215},{m:"Jan",rent:1740,o:1090},{m:"Feb",rent:0,o:460}];
const mortBalHC=[{m:"Mar'25",main:379761,top:0},{m:"Jun'25",main:379771,top:0},{m:"Sep'25",main:379381,top:0},{m:"Dec'25",main:377709,top:0},{m:"Jan'26",main:377183,top:50000},{m:"Mar'26",main:377922,top:50000}];
const sharesHC=[{code:"1AI",value:14047,pl:4816,pct:96.5,color:"#34d399"},{code:"OSL",value:156,pl:155,pct:1.1,color:"#60a5fa"},{code:"SBR",value:199,pl:98,pct:1.4,color:"#fbbf24"},{code:"NVX",value:112,pl:-430,pct:0.8,color:"#f87171"},{code:"CHM",value:20,pl:-1025,pct:0.1,color:"#ef4444"},{code:"OVT",value:18,pl:18,pct:0.1,color:"#94a3b8"}];
const topupPayoff=[{m:0,b6:50000,b4:50000,b2:50000},{m:12,b6:42800,b4:45200,b2:47600},{m:24,b6:34500,b4:39800,b2:45000},{m:36,b6:25000,b4:33800,b2:42200},{m:48,b6:14200,b4:27200,b2:39200},{m:60,b6:2000,b4:20000,b2:36000},{m:72,b6:0,b4:12000,b2:32600},{m:84,b6:0,b4:3200,b2:29000}];
const dowHC=[{d:"Mon",avg:206},{d:"Tue",avg:108},{d:"Wed",avg:108},{d:"Thu",avg:139},{d:"Fri",avg:189},{d:"Sat",avg:114},{d:"Sun",avg:244}];
const bvaHC=[{m:"Jul",amazon:2306,delivery:36,tolls:417,coffee:123},{m:"Aug",amazon:2806,delivery:190,tolls:502,coffee:135},{m:"Sep",amazon:712,delivery:204,tolls:164,coffee:151},{m:"Oct",amazon:482,delivery:261,tolls:602,coffee:158},{m:"Nov",amazon:1501,delivery:191,tolls:263,coffee:129},{m:"Dec",amazon:793,delivery:248,tolls:502,coffee:150},{m:"Jan",amazon:810,delivery:295,tolls:0,coffee:166},{m:"Feb",amazon:320,delivery:94,tolls:804,coffee:194}];
const upcoming=[{n:"Pilot",a:147,d:"~May",c:"#34d399"},{n:"Crazy Domains",a:200,d:"~Jun",c:"#f97316"},{n:"Grammarly+QuillBot+Oura",a:315,d:"Dec",c:"#f87171"},{n:"ROUVY",a:270,d:"Jan'27",c:"#14b8a6"},{n:"Council Rates",a:471,d:"~Qtr",c:"#eab308"}];
const hoursData=[{n:"Amazon (8mo)",cost:9651,hrs:156,days:20.5},{n:"Harley",cost:18550,hrs:300,days:39.5},{n:"Restaurants",cost:3656,hrs:59,days:7.8},{n:"Coffee (8mo)",cost:1162,hrs:19,days:2.5},{n:"Hulk Hogan",cost:446,hrs:7.2,days:0.9}];
const compound=[{n:"Restaurants",mo:457,yr10:54840,inv:78095},{n:"Amazon",mo:565,yr10:67800,inv:96527},{n:"Coffee",mo:150,yr10:18000,inv:25632},{n:"Delivery",mo:155,yr10:18600,inv:26487},{n:"Subs",mo:309,yr10:37080,inv:52790}];
const scorecard=[{m:"Jul",g:"D",cl:"#f87171"},{m:"Aug",g:"F",cl:"#ef4444"},{m:"Sep",g:"C",cl:"#fbbf24"},{m:"Oct",g:"D",cl:"#f87171"},{m:"Nov",g:"D",cl:"#f87171"},{m:"Dec",g:"F",cl:"#ef4444"},{m:"Jan",g:"C",cl:"#fbbf24"},{m:"Feb",g:"C",cl:"#22c55e"}];
const velocity=[{d:"Day 5",Oct:1422,Dec:1578,Jan:1639,Aug:2385},{d:"Day 10",Oct:2193,Dec:2554,Jan:3839,Aug:6689},{d:"Day 15",Oct:8376,Dec:9620,Jan:9588,Aug:11788},{d:"Day 20",Oct:8942,Dec:9857,Jan:11362,Aug:14904},{d:"Day 25",Oct:10086,Dec:10700,Jan:14996,Aug:16774},{d:"Day 30",Oct:10811,Dec:11727,Jan:16427,Aug:18099}];

const S = 10188;
const TC_BASE = 5825;
const CORE = 10188 + 300;
const DISC = CORE - TC_BASE - 500 - 526;

const tabGroups=[
  {label:"Summary",  tabs:[{id:"overview",l:"📊 Overview"},{id:"planner",l:"🎛️ Planner"}]},
  {label:"Assets",   tabs:[{id:"networth",l:"💰 Net Worth"},{id:"property",l:"🏠 Property"}]},
  {label:"Spending", tabs:[{id:"committed",l:"📌 Committed"},{id:"health",l:"💊 Health"},{id:"variable",l:"🛒 Variable"},{id:"paypal",l:"💳 PayPal"},{id:"savings",l:"🏦 Savings"}]},
  {label:"Insights", tabs:[{id:"insights",l:"💡 Insights"},{id:"deep",l:"🔬 Deep Dive"},{id:"trend",l:"📉 Trend"},{id:"subs",l:"📱 Subs"},{id:"heatmap",l:"📅 Heatmap"},{id:"search",l:"🔍 Search"}]},
  {label:"Planning", tabs:[{id:"tax",l:"💸 Tax"},{id:"compare",l:"⚖️ Compare"},{id:"growth",l:"🌱 Growth"}]},
  {label:"System",   tabs:[{id:"settings",l:"⚙️ Settings"}]},
];

// ─── SLIDER COMPONENT ────────────────────────────────────────────────────────
const calcTax = (gross) => {
  let tax = 0;
  if (gross <= 18200) tax = 0;
  else if (gross <= 45000) tax = (gross - 18200) * 0.16;
  else if (gross <= 135000) tax = 4288 + (gross - 45000) * 0.30;
  else if (gross <= 190000) tax = 31288 + (gross - 135000) * 0.37;
  else tax = 51638 + (gross - 190000) * 0.45;
  const medicare = gross * 0.02;
  let lito = 700;
  if (gross > 66667) lito = 0;
  else if (gross > 45000) lito = Math.max(0, 700 - (gross - 45000) * 0.015);
  else if (gross > 37500) lito = Math.max(0, 700 - (gross - 37500) * 0.05);
  const netTax = Math.max(0, tax - lito);
  const net = gross - netTax - medicare;
  const marginalRate = gross > 190000 ? 47 : gross > 135000 ? 39 : gross > 45000 ? 32 : gross > 18200 ? 18 : 0;
  return { gross, tax: Math.round(netTax), medicare: Math.round(medicare), net: Math.round(net), effectiveRate: ((netTax + medicare) / gross * 100).toFixed(1), marginalRate };
};

const Slider = ({ label, value, onChange, min, max, step = 50, prefix = "$", color = "#60a5fa", sub, suffix }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: "#94a3b8" }}>{label}{sub && <span style={{ fontSize: 9, color: "#475569", marginLeft: 5 }}>{sub}</span>}</span>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color }}>{prefix}{value.toLocaleString()}{suffix !== undefined ? suffix : label.includes("weekly") ? "/wk" : label.includes("value") ? "" : "/mo"}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
      style={{ width: "100%", height: 6, borderRadius: 3, appearance: "none", background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.06) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.06) 100%)`, outline: "none", cursor: "pointer" }} />
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#475569" }}>
      <span>{prefix}{min.toLocaleString()}</span><span>{prefix}{max.toLocaleString()}</span>
    </div>
  </div>
);

function DashboardInner() {
  const [tab, setTab] = useState("planner");
  const tC = cc.reduce((s, c) => s + c.a, 0);
  const tSM = sm.reduce((s, c) => s + c.c, 0);

  // ─── PLANNER STATE ───────────────────────────────────────────────────────
  const [salary, setSalary] = useState(10188);
  const [medicare, setMedicare] = useState(300);
  const [health, setHealth] = useState(500);
  const [transport, setTransport] = useState(526);
  const [foodBudget, setFoodBudget] = useState(813);
  const [amazonBudget, setAmazonBudget] = useState(500);
  const [paypalBudget, setPaypalBudget] = useState(0);
  const [miscBudget, setMiscBudget] = useState(400);
  const [savingsTransfer, setSavingsTransfer] = useState(200);
  const [topupExtra, setTopupExtra] = useState(200);
  const [rentalIncome, setRentalIncome] = useState(0);
  const [propertyValue, setPropertyValue] = useState(700000);
  const [sharesValue, setSharesValue] = useState(14552);
  const [sharesMonthly, setSharesMonthly] = useState(0);

  // ─── TAX STATE ───────────────────────────────────────────────────────────
  const [grossSalary, setGrossSalary] = useState(155000);

  // ─── SCENARIO B STATE ────────────────────────────────────────────────────
  const [bSalary, setBSalary] = useState(11209);
  const [bHealth, setBHealth] = useState(500);
  const [bTransport, setBTransport] = useState(526);
  const [bFood, setBFood] = useState(700);
  const [bAmazon, setBamazon] = useState(400);
  const [bPaypal, setBPaypal] = useState(0);
  const [bMisc, setBMisc] = useState(300);
  const [bSavings, setBSavings] = useState(400);
  const [bTopup, setBTopup] = useState(600);
  const [bRental, setBRental] = useState(0);
  const [bSharesMonthly, setBSharesMonthly] = useState(200);

  // ─── GROWTH STATE ────────────────────────────────────────────────────────
  const [growthMonthly, setGrowthMonthly] = useState(500);
  const [growthYears, setGrowthYears] = useState(10);
  const [extraCash, setExtraCash] = useState(400);

  // ─── LIVE DATA STATE ─────────────────────────────────────────────────────
  const DEFAULT_CONFIG = { upbankUrl: '', paypalUrl: '', gatewayMainUrl: '', gatewayTopUrl: '', commsecUrl: '' };
  const [sheetConfig, setSheetConfig] = useState(() => { try { return JSON.parse(localStorage.getItem('sheetConfig') || 'null') || DEFAULT_CONFIG; } catch { return DEFAULT_CONFIG; } });
  const [draftConfig, setDraftConfig] = useState(sheetConfig);
  const [upData, setUpData]     = useState(null);
  const [ppData, setPpData]     = useState(null);
  const [gwData, setGwData]     = useState(null);
  const [csData, setCsData]     = useState(null);
  const [gwMainRows, setGwMainRows] = useState(null);
  const [gwTopRows,  setGwTopRows]  = useState(null);
  const [srcStatus, setSrcStatus] = useState({ up: 'idle', pp: 'idle', gw: 'idle', cs: 'idle' });
  const [srcError,  setSrcError]  = useState({ up: '', pp: '', gw: '', cs: '' });
  const [isMobile,  setIsMobile]  = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCat,   setSearchCat]   = useState('all');

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (!sheetConfig.upbankUrl) return;
    setSrcStatus(s => ({ ...s, up: 'loading' }));
    fetchCSV(sheetConfig.upbankUrl)
      .then(rows => { setUpData(processUpBank(rows)); setSrcStatus(s => ({ ...s, up: 'loaded' })); })
      .catch(e   => { setSrcError(s => ({ ...s, up: e.message })); setSrcStatus(s => ({ ...s, up: 'error' })); });
  }, [sheetConfig.upbankUrl]);

  useEffect(() => {
    if (!sheetConfig.paypalUrl) return;
    setSrcStatus(s => ({ ...s, pp: 'loading' }));
    fetchCSV(sheetConfig.paypalUrl)
      .then(rows => { setPpData(processPayPal(rows)); setSrcStatus(s => ({ ...s, pp: 'loaded' })); })
      .catch(e   => { setSrcError(s => ({ ...s, pp: e.message })); setSrcStatus(s => ({ ...s, pp: 'error' })); });
  }, [sheetConfig.paypalUrl]);

  useEffect(() => {
    if (!sheetConfig.gatewayMainUrl) return;
    fetchCSV(sheetConfig.gatewayMainUrl).then(rows => setGwMainRows(rows)).catch(() => {});
  }, [sheetConfig.gatewayMainUrl]);

  useEffect(() => {
    if (!sheetConfig.gatewayTopUrl) return;
    fetchCSV(sheetConfig.gatewayTopUrl).then(rows => setGwTopRows(rows)).catch(() => {});
  }, [sheetConfig.gatewayTopUrl]);

  useEffect(() => {
    if (!gwMainRows && !gwTopRows) return;
    setSrcStatus(s => ({ ...s, gw: 'loading' }));
    try {
      setGwData(processGateway(gwMainRows, gwTopRows));
      setSrcStatus(s => ({ ...s, gw: 'loaded' }));
    } catch (e) {
      setSrcError(s => ({ ...s, gw: e.message }));
      setSrcStatus(s => ({ ...s, gw: 'error' }));
    }
  }, [gwMainRows, gwTopRows]);

  useEffect(() => {
    if (!sheetConfig.commsecUrl) return;
    setSrcStatus(s => ({ ...s, cs: 'loading' }));
    fetchCSV(sheetConfig.commsecUrl)
      .then(rows => { setCsData(processCommSec(rows)); setSrcStatus(s => ({ ...s, cs: 'loaded' })); })
      .catch(e   => { setSrcError(s => ({ ...s, cs: e.message })); setSrcStatus(s => ({ ...s, cs: 'error' })); });
  }, [sheetConfig.commsecUrl]);

  // ─── PLANNER CALCULATIONS ────────────────────────────────────────────────
  const plan = useMemo(() => {
    const coreIncome = salary + medicare + rentalIncome;
    const totalCommitted = tC;
    const afterCommitted = coreIncome - totalCommitted;
    const afterSemiFixed = afterCommitted - health - transport;
    const totalVariable = foodBudget + amazonBudget + paypalBudget + miscBudget;
    const afterVariable = afterSemiFixed - totalVariable;
    const totalOutflows = savingsTransfer + topupExtra + sharesMonthly;
    const surplus = afterVariable - totalOutflows;
    
    const annualSavings = savingsTransfer * 12;
    const monthsTo5k = savingsTransfer > 0 ? Math.ceil(5000 / savingsTransfer) : Infinity;
    
    // Top-up payoff
    const topupRate = 0.0606 / 12;
    let topupBal = 50000;
    let topupMonths = 0;
    if (topupExtra > 0) {
      while (topupBal > 0 && topupMonths < 360) {
        const interest = topupBal * topupRate;
        topupBal = Math.max(0, topupBal + interest - topupExtra);
        topupMonths++;
      }
    }
    const topupYears = topupExtra > 0 ? (topupMonths / 12).toFixed(1) : "Never";
    
    // Interest saved if top-up cleared
    const interestFreed = topupExtra > 0 && topupMonths < 360 ? 227 : 0;
    
    // Net worth projection
    const equity1yr = propertyValue - 377922 - Math.max(0, 50000 - topupExtra * 12);
    const netWorth1yr = equity1yr + sharesValue + sharesMonthly * 12 + 18000 + annualSavings;
    const netWorth3yr = propertyValue * 1.06 - 377922 - Math.max(0, 50000 - topupExtra * 36) + sharesValue + sharesMonthly * 36 + 18000 + savingsTransfer * 36;
    const netWorth5yr = propertyValue * 1.10 - 377922 - Math.max(0, 50000 - topupExtra * 60) + sharesValue + sharesMonthly * 60 + 18000 + savingsTransfer * 60;

    // Projection chart data
    const projData = Array.from({ length: 13 }, (_, i) => {
      const months = i * 3;
      const saved = savingsTransfer * months;
      const topPaid = Math.min(50000, topupExtra * months);
      const propGrowth = propertyValue * (1 + 0.02 * (months / 12));
      const nw = propGrowth - 377922 - (50000 - topPaid) + sharesValue + sharesMonthly * months + 18000 + saved;
      return { m: i === 0 ? "Now" : `M${months}`, nw: Math.round(nw), saved: Math.round(saved) };
    });
    
    return { coreIncome, afterCommitted, afterSemiFixed, totalVariable, afterVariable, surplus, annualSavings, monthsTo5k, topupMonths, topupYears, interestFreed, netWorth1yr, netWorth3yr, netWorth5yr, projData };
  }, [salary, medicare, health, transport, foodBudget, amazonBudget, paypalBudget, miscBudget, savingsTransfer, topupExtra, rentalIncome, propertyValue, sharesValue, sharesMonthly, tC]);

  // ─── SCENARIO B CALCULATIONS ─────────────────────────────────────────────
  const planB = useMemo(() => {
    const coreIncome = bSalary + 300 + bRental;
    const afterCommitted = coreIncome - tC;
    const afterSemiFixed = afterCommitted - bHealth - bTransport;
    const totalVariable = bFood + bAmazon + bPaypal + bMisc;
    const afterVariable = afterSemiFixed - totalVariable;
    const surplus = afterVariable - bSavings - bTopup - bSharesMonthly;
    const topupRate = 0.0606 / 12;
    let topupBal = 50000, topupMonths = 0;
    if (bTopup > 0) { while (topupBal > 0 && topupMonths < 360) { topupBal = Math.max(0, topupBal + topupBal * topupRate - bTopup); topupMonths++; } }
    const topupYears = bTopup > 0 ? (topupMonths / 12).toFixed(1) : "Never";
    const netWorth5yr = 700000 * 1.10 - 377922 - Math.max(0, 50000 - bTopup * 60) + sharesValue + bSharesMonthly * 60 + 18000 + bSavings * 60;
    return { coreIncome, afterCommitted, afterSemiFixed, totalVariable, afterVariable, surplus, topupYears, netWorth5yr };
  }, [bSalary, bHealth, bTransport, bFood, bAmazon, bPaypal, bMisc, bSavings, bTopup, bRental, bSharesMonthly, sharesValue, tC]);

  // ─── TAX CALCULATIONS ────────────────────────────────────────────────────
  const taxCalc = useMemo(() => calcTax(grossSalary), [grossSalary]);
  const taxComparisons = useMemo(() => [155000, 170000, 190000, 220000].map(g => calcTax(g)), []);

  // ─── GROWTH CALCULATIONS ─────────────────────────────────────────────────
  const growthData = useMemo(() => {
    const fv = (r, m) => r > 0
      ? sharesValue * Math.pow(1 + r, m) + growthMonthly * (Math.pow(1 + r, m) - 1) / r
      : sharesValue + growthMonthly * m;
    return Array.from({ length: growthYears + 1 }, (_, i) => ({
      yr: i === 0 ? "Now" : `Yr${i}`,
      cash: Math.round(fv(0, i * 12)),
      r7: Math.round(fv(0.07 / 12, i * 12)),
      r10: Math.round(fv(0.10 / 12, i * 12)),
      r15: Math.round(fv(0.15 / 12, i * 12)),
    }));
  }, [growthMonthly, growthYears, sharesValue]);

  // ─── DEBT PRIORITY CALCULATIONS ──────────────────────────────────────────
  const debtPriority = useMemo(() => {
    const months = 120;
    const topupRate = 0.0606 / 12;
    const sharesRate = 0.07 / 12;
    const baselineIO = 227 * months;
    const compFV = (monthly, r, n) => monthly * (Math.pow(1 + r, n) - 1) / r;
    const calcTopupInterest = (mo) => {
      let bal = 50000, interest = 0;
      for (let m = 0; m < months; m++) { const int = bal * topupRate; interest += int; bal = Math.max(0, bal + int - mo); if (bal === 0) break; }
      return interest;
    };
    const topupSaved = Math.round(baselineIO - calcTopupInterest(extraCash));
    const sharesFV = sharesValue * Math.pow(1 + sharesRate, months) + compFV(extraCash, sharesRate, months);
    const sharesGain = Math.round(sharesFV - sharesValue - extraCash * months);
    const half = extraCash / 2;
    const splitTopupSaved = Math.round(baselineIO - calcTopupInterest(Math.round(half)));
    const splitSharesFV = sharesValue * Math.pow(1 + sharesRate, months) + compFV(half, sharesRate, months);
    const splitGain = Math.round(splitTopupSaved + splitSharesFV - sharesValue - half * months);
    const mainSaved = Math.round(extraCash * (0.0581 / 12) * months * (months + 1) / 2);
    const strategies = [
      { label: "All to top-up (6.06%)", benefit: topupSaved, color: "#f97316", detail: `$${topupSaved.toLocaleString()} interest saved vs IO forever` },
      { label: "All to shares (7%)", benefit: sharesGain, color: "#34d399", detail: `$${sharesGain.toLocaleString()} wealth gained over 10yr` },
      { label: "50/50 top-up + shares", benefit: splitGain, color: "#60a5fa", detail: `$${splitTopupSaved.toLocaleString()} interest + $${Math.round(splitSharesFV - sharesValue - half * months).toLocaleString()} shares` },
      { label: "All to mortgage (5.81%)", benefit: mainSaved, color: "#f87171", detail: `$${mainSaved.toLocaleString()} interest saved over 10yr` },
    ].sort((a, b) => b.benefit - a.benefit);
    return { strategies };
  }, [extraCash, sharesValue]);

  // ─── DERIVED LIVE DATA ───────────────────────────────────────────────────
  const pnl     = upData?.pnl     ?? pnlHC;
  const amz     = upData?.amz     ?? amzHC;
  const food    = upData?.food    ?? foodHC;
  const hm      = upData?.hm      ?? hmHC;
  const hcats   = upData?.hcats   ?? hcatsHC;
  const dow     = upData?.dow     ?? dowHC;
  const bva     = upData?.bva     ?? bvaHC;
  const cd      = upData?.cd      ?? cdHC;
  const ppCats  = ppData?.ppCats  ?? ppCatsHC;
  const mortBal = gwData?.mortBal ?? mortBalHC;
  const shares  = csData?.shares  ?? sharesHC;
  const ppM = (() => {
    if (!ppData && !upData) return ppMHC;
    if (!ppData) return cd.map(r => ({ m: r.m, pi4: r.p, p: 0 }));
    if (!upData) return ppData.ppM.map(r => ({ m: r.m, pi4: 0, p: r.p }));
    const ppByMonth = Object.fromEntries(ppData.ppM.map(r => [r.m, r.p]));
    return cd.map(r => ({ m: r.m, pi4: r.p, p: ppByMonth[r.m] ?? 0 }));
  })();

  const surplusColor = plan.surplus >= 200 ? "#34d399" : plan.surplus >= 0 ? "#fbbf24" : "#f87171";
  const dailyTotals  = upData?.dailyTotals  ?? {};
  const transactions = upData?.transactions ?? [];
  const filteredTxs  = useMemo(() => transactions.filter(tx => {
    const matchQ = !searchQuery || tx.desc.toLowerCase().includes(searchQuery.toLowerCase());
    const matchC = searchCat === 'all' || tx.cat === searchCat;
    return matchQ && matchC;
  }), [transactions, searchQuery, searchCat]);

  const healthScore = useMemo(() => {
    const recent = pnl.slice(-3);
    const avgIncome = recent.reduce((s,r) => s+r.i, 0) / (recent.length || 1);
    const avgNet    = recent.reduce((s,r) => s+r.n, 0) / (recent.length || 1);
    const savingsRate = Math.max(0, avgNet / (avgIncome || 1));
    const positiveMonths = pnl.filter(r => r.n > 0).length / (pnl.length || 1);
    const latestMort = mortBal.at(-1) ?? {};
    const totalDebt = (latestMort.main || 0) + (latestMort.top || 0);
    const debtScore = Math.max(0, 1 - totalDebt / 800000);
    const portfolioVal = shares.reduce((s,r) => s+(r.value||0), 0);
    const hasInvestments = portfolioVal > 1000;
    const s1 = Math.min(35, savingsRate * 175);
    const s2 = positiveMonths * 30;
    const s3 = debtScore * 20;
    const s4 = hasInvestments ? 15 : 0;
    const total = Math.round(s1 + s2 + s3 + s4);
    const grade = total >= 80 ? 'A' : total >= 65 ? 'B' : total >= 50 ? 'C' : total >= 35 ? 'D' : 'F';
    const color = total >= 80 ? '#34d399' : total >= 65 ? '#60a5fa' : total >= 50 ? '#fbbf24' : '#f87171';
    return { total, grade, color, s1, s2, s3, s4, savingsRate, positiveMonths };
  }, [pnl, mortBal, shares]);

  const SidebarContent = ({ onSelect }) => (
    <>
      <div style={{ padding: "0 10px", marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>Financial Dashboard</h1>
        <div style={{ color: "#475569", fontSize: 11 }}>Jul 2025 — Feb 2026 · AUD</div>
      </div>
      {tabGroups.map(group => (
        <div key={group.label} style={{ marginBottom: 2 }}>
          <div style={{ fontSize: 10, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, padding: "10px 10px 4px" }}>{group.label}</div>
          {group.tabs.map(t => (
            <button key={t.id} onClick={() => { setTab(t.id); onSelect && onSelect(); }} style={{ display: "block", width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", textAlign: "left", background: tab === t.id ? "rgba(96,165,250,0.12)" : "transparent", color: tab === t.id ? "#93c5fd" : "#64748b" }}>{t.l}</button>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <div style={{ fontFamily: "'Instrument Sans',-apple-system,sans-serif", background: "#0b0b17", color: "#e2e8f0", minHeight: "100vh", display: "flex" }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#e2e8f0;cursor:pointer;border:2px solid #0b0b17;box-shadow:0 0 6px rgba(96,165,250,0.5)} input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#e2e8f0;cursor:pointer;border:2px solid #0b0b17}`}</style>

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      {!isMobile && (
        <div style={{ width: 215, flexShrink: 0, background: "rgba(255,255,255,0.015)", borderRight: "1px solid rgba(255,255,255,0.05)", padding: "22px 12px 48px", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>
          <SidebarContent />
        </div>
      )}

      {/* ═══ MOBILE TOP BAR ═══ */}
      {isMobile && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 52, background: "#0d0d1f", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", zIndex: 100 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>Financial Dashboard</span>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#94a3b8", fontSize: 18, width: 38, height: 38, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      )}

      {/* ═══ MOBILE MENU OVERLAY ═══ */}
      {isMobile && menuOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99, background: "#0b0b17", overflowY: "auto", padding: "64px 12px 48px" }}>
          <SidebarContent onSelect={() => setMenuOpen(false)} />
        </div>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ flex: 1, padding: isMobile ? "64px 16px 48px" : "22px 24px 48px", minWidth: 0 }}>

      {/* ═══ PLANNER ═══ */}
      {tab === "planner" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <St label="Monthly Surplus" value={(plan.surplus >= 0 ? "$" : "-$") + Math.abs(plan.surplus).toLocaleString()} accent={surplusColor} />
          <St label="Annual Savings" value={"$" + plan.annualSavings.toLocaleString()} accent="#60a5fa" />
          <St label="Top-Up Clear" value={plan.topupYears === "Never" ? "Never" : plan.topupYears + " yrs"} accent="#f97316" />
        </div>

        {/* Live waterfall */}
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 14, marginBottom: 16 }}>
          <Row label="Core income" value={"$" + plan.coreIncome.toLocaleString()} color="#34d399" bold />
          <Row label="− Committed costs" value={"−$" + tC.toLocaleString()} color="#f87171" />
          <Row label="− Health" value={"−$" + health.toLocaleString()} color="#06b6d4" />
          <Row label="− Transport" value={"−$" + transport.toLocaleString()} color="#eab308" />
          <Row label="= After semi-fixed" value={"$" + plan.afterSemiFixed.toLocaleString()} color="#fbbf24" bold borderTop />
          <Row label="− Food" value={"−$" + foodBudget.toLocaleString()} color="#ec4899" />
          <Row label="− Amazon" value={"−$" + amazonBudget.toLocaleString()} color="#f97316" />
          <Row label="− PayPal" value={"−$" + paypalBudget.toLocaleString()} color="#6366f1" />
          <Row label="− Misc" value={"−$" + miscBudget.toLocaleString()} color="#94a3b8" />
          <Row label="= After variable" value={"$" + plan.afterVariable.toLocaleString()} color={plan.afterVariable > 0 ? "#fbbf24" : "#f87171"} bold borderTop />
          <Row label="→ Savings transfer" value={"−$" + savingsTransfer.toLocaleString()} color="#60a5fa" />
          <Row label="→ Extra on top-up" value={"−$" + topupExtra.toLocaleString()} color="#f97316" />
          {sharesMonthly > 0 && <Row label="→ Shares investment" value={"−$" + sharesMonthly.toLocaleString()} color="#a78bfa" />}
          <Row label="= Monthly surplus/deficit" value={(plan.surplus >= 0 ? "$" : "−$") + Math.abs(plan.surplus).toLocaleString()} color={surplusColor} bold borderTop />
        </div>

        {/* Sliders - Income */}
        <Sec icon="💰">Income</Sec>
        <Slider label="Salary" value={salary} onChange={setSalary} min={10188} max={15000} step={100} color="#34d399" sub="Current: $10,188 · Target: $11,209" />
        <Slider label="Medicare rebates" value={medicare} onChange={setMedicare} min={0} max={800} step={50} color="#a78bfa" />
        <Slider label="Rental income (67 Leam Rd weekly)" value={rentalIncome} onChange={setRentalIncome} min={0} max={2500} step={50} color="#14b8a6" sub={rentalIncome > 0 ? `= $${(rentalIncome * 52 / 12).toFixed(0)}/mo from $${rentalIncome}/wk` : "Currently vacant"} prefix="$" />

        {/* Sliders - Variable spending */}
        <Sec icon="🛒">Variable Spending</Sec>
        <Slider label="Health (net)" value={health} onChange={setHealth} min={300} max={1500} step={50} color="#06b6d4" sub="Forward: ~$500" />
        <Slider label="Transport (tolls+fuel+parking)" value={transport} onChange={setTransport} min={300} max={900} step={25} color="#eab308" sub="With bike: ~$526" />
        <Slider label="Food (restaurants+takeaway+groceries)" value={foodBudget} onChange={setFoodBudget} min={400} max={1200} step={50} color="#ec4899" sub="8-mo avg: $813" />
        <Slider label="Amazon" value={amazonBudget} onChange={setAmazonBudget} min={0} max={1500} step={50} color="#f97316" sub="Jan-Feb avg: $565" />
        <Slider label="PayPal purchases" value={paypalBudget} onChange={setPaypalBudget} min={0} max={1000} step={50} color="#6366f1" sub="Currently $0" />
        <Slider label="Misc (events, tech, clothing, car)" value={miscBudget} onChange={setMiscBudget} min={0} max={1500} step={50} color="#94a3b8" />

        {/* Sliders - Allocations */}
        <Sec icon="🎯">Savings & Debt</Sec>
        <Slider label="Auto-transfer to savings" value={savingsTransfer} onChange={setSavingsTransfer} min={0} max={1500} step={50} color="#60a5fa" />
        <Slider label="Extra on top-up loan" value={topupExtra} onChange={setTopupExtra} min={0} max={1500} step={50} color="#f97316" sub={topupExtra > 0 ? `Clears $50k in ${plan.topupYears} years` : "Interest-only forever ($227/mo)"} />
        <Slider label="Monthly shares investment" value={sharesMonthly} onChange={setSharesMonthly} min={0} max={2000} step={50} color="#a78bfa" sub={sharesMonthly > 0 ? `$${(sharesMonthly * 12).toLocaleString()}/yr into shares` : "Not investing in shares"} />

        {/* Sliders - Assets */}
        <Sec icon="🏠">Assets</Sec>
        <Slider label="Property value" value={propertyValue} onChange={setPropertyValue} min={500000} max={900000} step={10000} color="#fbbf24" sub="Valued at $700k late 2025" />
        <Slider label="Share portfolio value" value={sharesValue} onChange={setSharesValue} min={0} max={100000} step={500} color="#a78bfa" sub="Current: $14,552 (96.5% in 1AI)" />

        {/* Projections */}
        <Sec icon="📈">Net Worth Projection</Sec>
        <Ch height={200}>
          <AreaChart data={plan.projData} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>
            {gd}<XAxis dataKey="m" {...xP} /><YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<Tip />} />
            <Area dataKey="nw" name="Net Worth" stroke="#34d399" fill="#34d399" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </Ch>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <St small label="Now" value="$305k" accent="#94a3b8" />
          <St small label="1 Year" value={"$" + (plan.netWorth1yr / 1000).toFixed(0) + "k"} accent="#60a5fa" />
          <St small label="3 Year" value={"$" + (plan.netWorth3yr / 1000).toFixed(0) + "k"} accent="#34d399" />
          <St small label="5 Year" value={"$" + (plan.netWorth5yr / 1000).toFixed(0) + "k"} accent="#fbbf24" />
        </div>

        {/* Key metrics */}
        <Sec icon="📊">Key Metrics</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 14 }}>
          <Row label="Months to $5k buffer" value={plan.monthsTo5k === Infinity ? "N/A" : plan.monthsTo5k + " months"} color={plan.monthsTo5k <= 12 ? "#34d399" : "#fbbf24"} />
          <Row label="Annual savings" value={"$" + plan.annualSavings.toLocaleString()} color="#60a5fa" />
          <Row label="Top-up cleared in" value={plan.topupYears === "Never" ? "Never (IO)" : plan.topupYears + " years"} color={plan.topupYears !== "Never" && parseFloat(plan.topupYears) < 7 ? "#34d399" : "#f97316"} />
          <Row label="Interest freed when top-up cleared" value={plan.interestFreed > 0 ? "$227/mo" : "—"} color="#34d399" />
          <Row label="Property equity" value={"$" + (propertyValue - 377922 - 50000 + Math.min(50000, topupExtra * 12)).toLocaleString()} color="#fbbf24" borderTop bold />
        </div>

        {/* Quick scenarios */}
        <Sec icon="⚡">Quick Scenarios</Sec>
        <div style={{ display: "grid", gap: 5 }}>
          {[
            { label: "Current salary, conservative", action: () => { setSalary(10188); setAmazonBudget(500); setFoodBudget(750); setSavingsTransfer(200); setTopupExtra(200); setRentalIncome(0); }, color: "#60a5fa" },
            { label: "$190k salary, aggressive savings", action: () => { setSalary(11209); setAmazonBudget(400); setFoodBudget(700); setSavingsTransfer(400); setTopupExtra(600); setRentalIncome(0); }, color: "#34d399" },
            { label: "$190k + property rented at $400/wk", action: () => { setSalary(11209); setAmazonBudget(400); setFoodBudget(700); setSavingsTransfer(800); setTopupExtra(1000); setRentalIncome(1733); }, color: "#fbbf24" },
            { label: "Reset to current reality", action: () => { setSalary(10188); setMedicare(300); setHealth(500); setTransport(526); setFoodBudget(813); setAmazonBudget(500); setPaypalBudget(0); setMiscBudget(400); setSavingsTransfer(200); setTopupExtra(200); setRentalIncome(0); setPropertyValue(700000); setSharesValue(14552); setSharesMonthly(0); }, color: "#94a3b8" },
          ].map((s, i) => (
            <button key={i} onClick={s.action} style={{ padding: "10px 14px", borderRadius: 10, background: `${s.color}08`, border: `1px solid ${s.color}15`, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>)}

      {/* ═══ OVERVIEW ═══ */}
      {tab === "overview" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Net Worth" value="$304,630" accent="#34d399" /><St label="Surplus" value={"$" + DISC.toLocaleString()} sub="Forward" accent="#fbbf24" /><St label="Debt" value="$427,922" accent="#f87171" /></div>

        {/* Financial Health Score */}
        <div style={{ marginTop: 14, background: "linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))", border: `1px solid ${healthScore.color}22`, borderRadius: 16, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <svg width={80} height={80} viewBox="0 0 80 80">
                <circle cx={40} cy={40} r={32} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
                <circle cx={40} cy={40} r={32} fill="none" stroke={healthScore.color} strokeWidth={7}
                  strokeDasharray={`${(healthScore.total / 100) * 201} 201`}
                  strokeLinecap="round" transform="rotate(-90 40 40)" style={{ transition: "stroke-dasharray 0.6s ease" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: healthScore.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{healthScore.total}</div>
                <div style={{ fontSize: 11, color: "#475569", fontWeight: 600 }}>{healthScore.grade}</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 10 }}>Financial Health Score</div>
              {[
                { label: "Savings rate", val: healthScore.s1, max: 35, color: "#34d399" },
                { label: "Surplus consistency", val: healthScore.s2, max: 30, color: "#60a5fa" },
                { label: "Debt ratio", val: healthScore.s3, max: 20, color: "#a78bfa" },
                { label: "Investing", val: healthScore.s4, max: 15, color: "#fbbf24" },
              ].map(({ label, val, max, color }) => (
                <div key={label} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b", marginBottom: 2 }}>
                    <span>{label}</span><span style={{ color }}>{Math.round(val)}/{max}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: color, width: `${(val / max) * 100}%`, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Sec icon="📊">Cash Flow</Sec>
        <Ch height={210}><ComposedChart data={pnl.map(d => ({ month: d.m, income: d.i, spending: d.s, net: d.n }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="income" name="Income" fill="#34d399" radius={[3, 3, 0, 0]} barSize={18} opacity={0.7} /><Bar dataKey="spending" name="Spending" fill="#f87171" radius={[3, 3, 0, 0]} barSize={18} opacity={0.5} /><Line dataKey="net" name="Net" stroke="#fbbf24" strokeWidth={2.5} dot={{ fill: "#fbbf24", r: 3.5 }} /><ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" /></ComposedChart></Ch>
        <Sec icon="💡">Waterfall</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 16 }}>
          <Row label="Salary" value={"$" + S.toLocaleString()} color="#34d399" /><Row label="+Medicare" value="+$300" color="#a78bfa" /><Row label="=Core" value={"$" + CORE.toLocaleString()} color="#34d399" bold borderTop /><Row label="−Committed" value={"−$" + tC.toLocaleString()} color="#f87171" /><Row label="=After" value={"$" + (CORE - tC).toLocaleString()} color="#fbbf24" bold borderTop /><Row label="−Health" value="−$500" color="#06b6d4" /><Row label="−Transport" value="−$526" color="#eab308" /><Row label="=Discretionary" value={"$" + DISC.toLocaleString()} color="#f8fafc" bold borderTop />
        </div>
        <Note color="#34d399"><span style={{ color: "#34d399", fontWeight: 700 }}>Asset-rich, cash-poor. </span>$304k net worth but near-breakeven monthly. Use the Planner tab to model scenarios.</Note>
        <Sec icon="⚡">One-Offs</Sec>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><Card label="Harley" value="$21,477" type="out" detail="Via $50k top-up" /><Card label="ATO Refund" value="$14,275" type="in" detail="Jul" /><Card label="Driveway" value="~$28,500" type="out" detail="Via top-up" /><Card label="Surgery" value="$5,642" type="out" detail="Sep" /></div>
      </div>)}

      {/* ═══ NET WORTH ═══ */}
      {tab === "networth" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Assets" value="$732,552" accent="#34d399" /><St label="Debt" value="$427,922" accent="#f87171" /><St label="Net Worth" value="$304,630" accent="#fbbf24" /></div>
        <Sec icon="📊">Balance Sheet</Sec>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "rgba(52,211,153,0.04)", borderRadius: 14, border: "1px solid rgba(52,211,153,0.08)", padding: 14 }}>
            <div style={{ fontSize: 10, color: "#34d399", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Assets</div>
            {[{ n: "67 Leam Rd", v: 700000 }, { n: "Shares", v: 14552 }, { n: "Harley", v: 18000 }].map((a, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 11, color: "#94a3b8" }}>{a.n}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#34d399" }}>${a.v.toLocaleString()}</span></div>))}
            <div style={{ borderTop: "1px solid rgba(52,211,153,0.1)", paddingTop: 6, display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: "#34d399" }}>$732,552</span></div>
          </div>
          <div style={{ background: "rgba(248,113,113,0.04)", borderRadius: 14, border: "1px solid rgba(248,113,113,0.08)", padding: 14 }}>
            <div style={{ fontSize: 10, color: "#f87171", textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Liabilities</div>
            {[{ n: "Main mortgage", v: 377922 }, { n: "Top-up loan", v: 50000 }].map((a, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 11, color: "#94a3b8" }}>{a.n}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#f87171" }}>${a.v.toLocaleString()}</span></div>))}
            <div style={{ borderTop: "1px solid rgba(248,113,113,0.1)", paddingTop: 6, display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: "#f87171" }}>$427,922</span></div>
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 12, padding: 14, borderRadius: 12, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.1)" }}><div style={{ fontSize: 10, color: "#fbbf24", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Net Worth</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 800, color: "#fbbf24" }}>$304,630</div><div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>LVR 61.1% · Property equity $272k</div></div>
        <Sec icon="📈">Shares ($14,552)</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {shares.map((s, i) => (<div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr 55px 55px", padding: "5px 10px", borderBottom: i < shares.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, color: s.color }}>{s.code}</span><div style={{ height: 5, background: "rgba(255,255,255,0.03)", borderRadius: 3, overflow: "hidden", alignSelf: "center" }}><div style={{ width: `${s.pct}%`, height: "100%", background: s.color, opacity: 0.5, borderRadius: 3 }} /></div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1", textAlign: "right" }}>${s.value.toLocaleString()}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: s.pl >= 0 ? "#34d399" : "#f87171", textAlign: "right" }}>{s.pl >= 0 ? "+" : ""}${s.pl.toLocaleString()}</span></div>))}
        </div>
        <Note color="#fbbf24"><span style={{ color: "#fbbf24", fontWeight: 700 }}>96.5% in 1AI. </span>Essentially a single-stock portfolio.</Note>
      </div>)}

      {/* ═══ PROPERTY ═══ */}
      {tab === "property" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Value" value="$700k" accent="#34d399" /><St label="Debt" value="$428k" accent="#f87171" /><St label="Equity" value="$272k" accent="#fbbf24" /></div>
        <Sec icon="📊">Mortgage Balance</Sec>
        <Ch height={190}><ComposedChart data={mortBal} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="m" {...xP} /><YAxis domain={[370000, 435000]} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<Tip />} /><Area dataKey="main" name="Main" stroke="#f87171" fill="#f87171" fillOpacity={0.1} strokeWidth={2} /><Area dataKey="top" name="Top-Up" stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={2} /></ComposedChart></Ch>
        <Note color="#f87171">92.5% of main mortgage payments go to interest. Only $153/mo reduces principal.</Note>
        <Sec icon="💰">Monthly Costs ($2,569)</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 12 }}>
          <Row label="Main interest" value="$1,792" color="#f87171" note="5.81%" /><Row label="Top-up interest" value="$227" color="#f97316" note="6.06% IO" /><Row label="Rates+tax+water" value="$292" /><Row label="LPG" value="$105" /><Row label="Total" value="$2,569/mo" color="#f87171" bold borderTop />
        </div>
        <Sec icon="📉">Top-Up Payoff</Sec>
        <Ch height={180}><LineChart data={topupPayoff} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="m" tickFormatter={v => `M${v}`} {...xP} /><YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<Tip />} /><Line dataKey="b6" name="$600/mo" stroke="#34d399" strokeWidth={2} dot={false} /><Line dataKey="b4" name="$400/mo" stroke="#60a5fa" strokeWidth={2} dot={false} /><Line dataKey="b2" name="$200/mo" stroke="#fbbf24" strokeWidth={2} dot={false} /><ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" /></LineChart></Ch>
        <Lg items={[["$600/mo (6.5yr)", "#34d399"], ["$400/mo (9yr)", "#60a5fa"], ["$200/mo (14yr)", "#fbbf24"]]} />
        <Sec icon="🏠">Personal</Sec>
        <div style={{ background: "rgba(96,165,250,0.04)", borderRadius: 12, border: "1px solid rgba(96,165,250,0.1)", padding: 14, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>Dad's house. Held for personal reasons. The Planner tab lets you model "what if" rental scenarios without commitment.</div>
      </div>)}

      {/* ═══ COMMITTED ═══ */}
      {tab === "committed" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Committed" value={"$" + tC.toLocaleString()} accent="#f87171" /><St label="% Salary" value={((tC / S) * 100).toFixed(0) + "%"} accent="#fbbf24" /></div>
        <Sec icon="📌">Breakdown</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {cc.map((c, i) => (<div key={i} style={{ display: "flex", alignItems: "center", padding: "6px 12px", gap: 8, borderBottom: i < cc.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}><div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#cbd5e1" }}>{c.n}</div>{c.no && <div style={{ fontSize: 9, color: "#475569" }}>{c.no}</div>}</div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "#94a3b8", width: 50, textAlign: "right" }}>${c.a.toLocaleString()}</span></div>))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.02)" }}><span style={{ fontWeight: 700 }}>Total</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: "#f87171" }}>${tC.toLocaleString()}/mo</span></div>
        </div>
      </div>)}

      {/* ═══ HEALTH ═══ */}
      {tab === "health" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Historical" value="$17,782" accent="#f87171" /><St label="Forward" value="~$500" sub="Net" accent="#06b6d4" /></div>
        <Sec icon="📊">Monthly</Sec>
        <Ch height={190}><ComposedChart data={hm.map(d => ({ month: d.m, recurring: d.rec, oneoff: d.one, medicare: d.mc }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="recurring" name="Recurring" stackId="a" fill="#06b6d4" barSize={22} opacity={0.6} /><Bar dataKey="oneoff" name="One-Off" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={22} opacity={0.5} /><Line dataKey="medicare" name="Medicare" stroke="#34d399" strokeWidth={2} dot={{ fill: "#34d399", r: 3 }} strokeDasharray="4 2" /></ComposedChart></Ch>
        <Sec icon="📋">Categories</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: "10px 14px" }}>
          {hcats.map((c, i) => (<div key={i} style={{ marginBottom: 5, opacity: c.n === "Surgery" ? 0.5 : 1 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 75, fontSize: 10, color: "#94a3b8", textAlign: "right" }}>{c.n}</div><div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.025)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(c.t / 5642) * 100}%`, height: "100%", background: c.c, opacity: 0.6, borderRadius: 3 }} /></div><div style={{ width: 45, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1", textAlign: "right" }}>${c.t.toLocaleString()}</div></div>{c.no && <div style={{ fontSize: 9, color: "#475569", paddingLeft: 85 }}>{c.no}</div>}</div>))}
        </div>
      </div>)}

      {/* ═══ VARIABLE ═══ */}
      {tab === "variable" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Discretionary" value={"$" + DISC.toLocaleString()} accent="#fbbf24" /><St label="Amz+PP" value="$565" sub="Jan-Feb" accent="#34d399" /></div>
        <Sec icon="🍔">Food ($813/mo)</Sec>
        <Ch height={180}><BarChart data={food.map(d => ({ month: d.m, restaurants: d.r, takeaway: d.t, groceries: d.g }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="restaurants" name="Restaurants" stackId="a" fill="#ec4899" barSize={22} /><Bar dataKey="takeaway" name="Takeaway" stackId="a" fill="#f43f5e" barSize={22} /><Bar dataKey="groceries" name="Groceries" stackId="a" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={22} /></BarChart></Ch>
        <Sec icon="📦">Amazon ($565 recent)</Sec>
        <Ch height={150}><BarChart data={amz.map(d => ({ month: d.m, amount: d.v }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="amount" name="Amazon" fill="#f97316" radius={[4, 4, 0, 0]} barSize={26} /></BarChart></Ch>
      </div>)}

      {/* ═══ PAYPAL ═══ */}
      {tab === "paypal" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Gross" value="$17,533" accent="#f87171" /><St label="Refunds" value="-$2,023" accent="#34d399" /><St label="Net" value="$15,509" accent="#fbbf24" /></div>
        <Note color="#6366f1"><span style={{ color: "#6366f1", fontWeight: 700 }}>Decoded: </span>Mostly Pay in 4 repayments. Now cleared.</Note>
        <Sec icon="📊">Purchases vs Pay in 4</Sec>
        <Ch height={190}><BarChart data={ppM.map(d => ({ month: d.m, purchases: d.p, pi4: d.pi4 }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="purchases" name="Purchases" stackId="a" fill="#6366f1" barSize={22} opacity={0.7} /><Bar dataKey="pi4" name="Pay in 4" stackId="a" fill="#a855f7" radius={[3, 3, 0, 0]} barSize={22} opacity={0.4} /></BarChart></Ch>
        <Sec icon="📋">Categories</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {ppCats.map((c, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: i < ppCats.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: c.c }} /><span style={{ fontSize: 11, color: "#e2e8f0" }}>{c.n}</span></div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#cbd5e1" }}>${c.t.toLocaleString()}</span></div>))}
        </div>
      </div>)}

      {/* ═══ SAVINGS ═══ */}
      {tab === "savings" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Drawn" value="$38,408" accent="#f87171" /><St label="Avg" value="$4,801" sub="/mo" accent="#fbbf24" /></div>
        <Sec icon="📊">By Source</Sec>
        <Ch height={190}><BarChart data={sdr.map(d => ({ month: d.m, Investment: d.inv, Savings: d.sav, Other: d.oth }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="Investment" stackId="a" fill="#f87171" barSize={22} /><Bar dataKey="Savings" stackId="a" fill="#fbbf24" barSize={22} /><Bar dataKey="Other" stackId="a" fill="#60a5fa" radius={[3, 3, 0, 0]} barSize={22} /></BarChart></Ch>
        <Sec icon="🎯">Strategy</Sec>
        <div style={{ display: "grid", gap: 5 }}>
          {[{ t: "Phase 1: Buffer $2-3k", d: "$400/mo → savings (6 months)", c: "#60a5fa" }, { t: "Phase 2: Split", d: "$200 savings + $200 top-up", c: "#fbbf24" }, { t: "Phase 3: At $190k", d: "$400 savings + $600 top-up", c: "#34d399" }].map((s, i) => (<div key={i} style={{ padding: 8, borderRadius: 8, background: `${s.c}05`, border: `1px solid ${s.c}10` }}><span style={{ fontSize: 11, fontWeight: 700, color: s.c }}>{s.t}</span><div style={{ fontSize: 10, color: "#94a3b8" }}>{s.d}</div></div>))}
        </div>
        <Sec icon="👫">Safiye</Sec>
        <Ch height={160}><BarChart data={saf.map(d => ({ month: d.m, rent: d.rent, other: d.o }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="rent" name="Rent" fill="#60a5fa" barSize={18} opacity={0.5} /><Bar dataKey="other" name="Other" fill="#34d399" barSize={18} /></BarChart></Ch>
      </div>)}

      {/* ═══ INSIGHTS ═══ */}
      {tab === "insights" && (<div>
        <Sec icon="📅">Day of Week</Sec>
        <Ch height={160}><BarChart data={dow.map(d => ({ day: d.d, avg: d.avg }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="day" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="avg" name="Avg/txn" radius={[4, 4, 0, 0]} barSize={24} opacity={0.7}>{dow.map((d, i) => <Cell key={i} fill={d.avg > 200 ? "#f87171" : d.avg > 150 ? "#fbbf24" : "#6366f1"} />)}</Bar></BarChart></Ch>
        <Note color="#f87171"><span style={{ color: "#f87171", fontWeight: 700 }}>Sun $244 & Mon $206</span> — double midweek.</Note>
        <Sec icon="🎯">Budget vs Actual</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "40px repeat(8,1fr)", padding: "5px 8px", background: "rgba(255,255,255,0.02)" }}><div />{bva.map(d => (<div key={d.m} style={{ fontSize: 8, color: "#64748b", fontWeight: 600, textAlign: "center" }}>{d.m}</div>))}</div>
          {[{ k: "amazon", l: "Amz", tg: 500 }, { k: "delivery", l: "Del", tg: 150 }, { k: "tolls", l: "Tolls", tg: 200 }, { k: "coffee", l: "Cof", tg: 120 }].map((cat, ci) => (<div key={cat.k} style={{ display: "grid", gridTemplateColumns: "40px repeat(8,1fr)", padding: "3px 8px", borderBottom: ci < 3 ? "1px solid rgba(255,255,255,0.03)" : "none" }}><div style={{ fontSize: 8, color: "#94a3b8" }}>{cat.l}</div>{bva.map(d => { const v = d[cat.k]; return (<div key={d.m} style={{ textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fontWeight: 600, color: v > cat.tg ? "#f87171" : "#34d399" }}>{v > 0 ? `$${v}` : "—"}</div>); })}</div>))}
        </div>
        <Sec icon="📆">Upcoming</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {upcoming.map((p, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: i < upcoming.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: p.c }} /><span style={{ fontSize: 10, color: "#e2e8f0" }}>{p.n}</span><span style={{ fontSize: 8, color: "#475569" }}>{p.d}</span></div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1" }}>${p.a}</span></div>))}
        </div>
      </div>)}

      {/* ═══ DEEP DIVE ═══ */}
      {tab === "deep" && (<div>
        <Sec icon="🏍️">Harley ROI (Corrected)</Sec>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St small label="Toll Save" value="$207" accent="#34d399" /><St small label="Interest" value="$108" accent="#f97316" /><St small label="Net" value="$99/mo" accent="#fbbf24" /><St small label="Break-even" value="~18yr" accent="#94a3b8" /></div>
        <Sec icon="🔥">Spending Velocity</Sec>
        <Ch height={190}><LineChart data={velocity} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="d" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Line dataKey="Oct" stroke="#34d399" strokeWidth={2} dot={false} name="Oct (best)" /><Line dataKey="Dec" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Dec" /><Line dataKey="Jan" stroke="#60a5fa" strokeWidth={1.5} dot={false} name="Jan" /><Line dataKey="Aug" stroke="#f87171" strokeWidth={1.5} dot={false} name="Aug" /></LineChart></Ch>
        <Sec icon="⏰">Hours of Work</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {hoursData.map((h, i) => (<div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 55px 45px 40px", padding: "5px 10px", borderBottom: i < hoursData.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><div style={{ fontSize: 10, color: "#e2e8f0" }}>{h.n}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1", textAlign: "right" }}>${h.cost.toLocaleString()}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#fbbf24", textAlign: "right" }}>{h.hrs}h</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#f87171", textAlign: "right" }}>{h.days}d</div></div>))}
        </div>
        <Sec icon="📈">10yr Compound Cost (Invested at 7%)</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {compound.map((c, i) => (<div key={i} style={{ display: "grid", gridTemplateColumns: "70px 40px 50px 55px", padding: "4px 10px", borderBottom: i < compound.length - 1 ? "1px solid rgba(255,255,255,0.03)" : "none" }}><div style={{ fontSize: 10, color: "#94a3b8" }}>{c.n}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#cbd5e1", textAlign: "right" }}>${c.mo}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#f87171", textAlign: "right" }}>${(c.yr10 / 1000).toFixed(0)}k</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#34d399", textAlign: "right" }}>${(c.inv / 1000).toFixed(0)}k</div></div>))}
        </div>
        <Sec icon="🏆">Scorecard</Sec>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{scorecard.map((s, i) => (<div key={i} style={{ width: 68, padding: "7px 5px", borderRadius: 10, background: `${s.cl}08`, border: `1px solid ${s.cl}15`, textAlign: "center" }}><div style={{ fontSize: 8, color: "#64748b" }}>{s.m}</div><div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: s.cl, lineHeight: 1 }}>{s.g}</div></div>))}</div>
      </div>)}

      {/* ═══ TREND ═══ */}
      {tab === "trend" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="8-Mo Deficit" value="-$4,780" accent="#f87171" /><St label="Forward" value="+$400" accent="#34d399" /></div>
        <Sec icon="📉">Amazon + PayPal</Sec>
        <Ch height={190}><BarChart data={cd.map(d => ({ month: d.m, Amazon: d.a, PayPal: d.p }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="Amazon" stackId="a" fill="#f97316" barSize={24} /><Bar dataKey="PayPal" stackId="a" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={24} /></BarChart></Ch>
        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          <div style={{ padding: 12, borderRadius: 10, background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.08)" }}><div style={{ fontSize: 9, color: "#f87171", textTransform: "uppercase", fontWeight: 700 }}>Jul—Dec</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: "#f87171" }}>$2,944</div></div>
          <div style={{ padding: 12, borderRadius: 10, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.08)" }}><div style={{ fontSize: 9, color: "#34d399", textTransform: "uppercase", fontWeight: 700 }}>Jan—Feb</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: "#34d399" }}>$565</div></div>
        </div>
        <Sec icon="✅">Actioned</Sec>
        <div style={{ display: "grid", gap: 3 }}>
          {[{ a: "Pay in 4 cleared", s: "+$1,510" }, { a: "Amazon cut", s: "+$868" }, { a: "Stan+OpenAI", s: "+$75" }, { a: "Bike tolls (net)", s: "+$99" }, { a: "Health (fwd)", s: "+$503" }].map((w, i) => (<div key={i} style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.08)", display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 10, color: "#cbd5e1" }}>{w.a}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, color: "#34d399" }}>{w.s}/mo</span></div>))}
        </div>
      </div>)}

      {/* ═══ SUBS ═══ */}
      {tab === "subs" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Monthly" value={"$" + tSM.toFixed(0)} accent="#60a5fa" /><St label="Annual" value="~$62" sub="/mo" accent="#a78bfa" /></div>
        <Note color="#34d399"><span style={{ color: "#34d399", fontWeight: 700 }}>Cut: </span>Stan, OpenAI, Spotify down. Saved $91/mo.</Note>
        <Sec icon="📅">Monthly</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {sm.map((s, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: i < sm.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: s.t === "e" ? "#34d399" : "#94a3b8" }} /><span style={{ fontSize: 11, color: "#e2e8f0" }}>{s.n}</span>{s.no && <span style={{ fontSize: 9, color: "#475569" }}>— {s.no}</span>}</div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#cbd5e1" }}>${s.c % 1 ? s.c.toFixed(2) : s.c}</span></div>))}
        </div>
        <Sec icon="📆">Annual</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {sa.map((s, i) => { const tc = s.t === "e" ? "#34d399" : s.t === "r" ? "#fbbf24" : s.t === "p" ? "#60a5fa" : "#94a3b8"; return (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: i < sa.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: tc }} /><span style={{ fontSize: 11, color: "#e2e8f0" }}>{s.n}</span><span style={{ fontSize: 9, color: "#475569" }}>— {s.f}</span></div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1" }}>${s.c}/yr</span></div>); })}
        </div>
      </div>)}

      {/* ═══ TAX MODELLER ═══ */}
      {tab === "tax" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <St label="Net/yr" value={"$" + taxCalc.net.toLocaleString()} accent="#34d399" />
          <St label="Net/mo" value={"$" + Math.round(taxCalc.net / 12).toLocaleString()} accent="#60a5fa" />
          <St label="Effective rate" value={taxCalc.effectiveRate + "%"} accent="#fbbf24" />
          <St label="Marginal rate" value={taxCalc.marginalRate + "%"} accent="#f97316" />
        </div>
        <Slider label="Gross salary" value={grossSalary} onChange={setGrossSalary} min={100000} max={300000} step={1000} color="#34d399" suffix="/yr" />
        <Sec icon="💧">Breakdown</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 14 }}>
          <Row label="Gross salary" value={"$" + grossSalary.toLocaleString()} color="#34d399" bold />
          <Row label="− Income tax" value={"−$" + taxCalc.tax.toLocaleString()} color="#f87171" />
          <Row label="− Medicare levy (2%)" value={"−$" + taxCalc.medicare.toLocaleString()} color="#f97316" />
          <Row label="= Net income" value={"$" + taxCalc.net.toLocaleString()} color="#34d399" bold borderTop />
          <Row label="= Per month" value={"$" + Math.round(taxCalc.net / 12).toLocaleString()} color="#60a5fa" />
        </div>
        <Sec icon="📊">Salary Comparison</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "70px repeat(4,1fr)", padding: "6px 12px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div />
            {taxComparisons.map(c => (<div key={c.gross} style={{ fontSize: 9, color: "#64748b", fontWeight: 700, textAlign: "right" }}>${(c.gross / 1000).toFixed(0)}k</div>))}
          </div>
          {[
            { l: "Net/yr", fn: c => "$" + c.net.toLocaleString() },
            { l: "Net/mo", fn: c => "$" + Math.round(c.net / 12).toLocaleString() },
            { l: "Tax total", fn: c => "$" + (c.tax + c.medicare).toLocaleString() },
            { l: "Eff. rate", fn: c => c.effectiveRate + "%" },
          ].map((row, ri) => (
            <div key={ri} style={{ display: "grid", gridTemplateColumns: "70px repeat(4,1fr)", padding: "5px 12px", borderBottom: ri < 3 ? "1px solid rgba(255,255,255,0.03)" : "none" }}>
              <div style={{ fontSize: 10, color: "#94a3b8" }}>{row.l}</div>
              {taxComparisons.map(c => (<div key={c.gross} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1", textAlign: "right" }}>{row.fn(c)}</div>))}
            </div>
          ))}
        </div>
        <Note color="#fbbf24"><span style={{ color: "#fbbf24", fontWeight: 700 }}>2024-25 rates (Stage 3). </span>Includes LITO offset. Assumes no deductions or super adjustments.</Note>
      </div>)}

      {/* ═══ COMPARE ═══ */}
      {tab === "compare" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <St label="A Surplus" value={(plan.surplus >= 0 ? "$" : "-$") + Math.abs(plan.surplus).toLocaleString()} accent="#a78bfa" />
          <St label="B Surplus" value={(planB.surplus >= 0 ? "$" : "-$") + Math.abs(planB.surplus).toLocaleString()} accent="#34d399" />
          <St label="Δ Surplus" value={(planB.surplus - plan.surplus >= 0 ? "+$" : "-$") + Math.abs(planB.surplus - plan.surplus).toLocaleString()} accent={planB.surplus > plan.surplus ? "#34d399" : "#f87171"} />
        </div>
        <Note color="#a78bfa"><span style={{ color: "#a78bfa", fontWeight: 700 }}>A = your Planner tab values. </span>Set Scenario B below to model your target.</Note>
        <Sec icon="📊">Waterfall Comparison</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 75px 75px 65px", padding: "6px 14px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div /><div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 700, textAlign: "right" }}>A</div><div style={{ fontSize: 9, color: "#34d399", fontWeight: 700, textAlign: "right" }}>B</div><div style={{ fontSize: 9, color: "#64748b", fontWeight: 700, textAlign: "right" }}>Δ</div>
          </div>
          {[
            { l: "Core income", a: plan.coreIncome, b: planB.coreIncome },
            { l: "After committed", a: plan.afterCommitted, b: planB.afterCommitted },
            { l: "After semi-fixed", a: plan.afterSemiFixed, b: planB.afterSemiFixed },
            { l: "After variable", a: plan.afterVariable, b: planB.afterVariable },
            { l: "Monthly surplus", a: plan.surplus, b: planB.surplus, bold: true },
          ].map((row, i) => {
            const delta = row.b - row.a;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 75px 75px 65px", padding: row.bold ? "8px 14px" : "5px 14px", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.03)" : "none", background: row.bold ? "rgba(255,255,255,0.02)" : "none" }}>
                <span style={{ fontSize: 11, color: row.bold ? "#e2e8f0" : "#94a3b8", fontWeight: row.bold ? 700 : 400 }}>{row.l}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#a78bfa", textAlign: "right" }}>${row.a.toLocaleString()}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#34d399", textAlign: "right" }}>${row.b.toLocaleString()}</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: delta >= 0 ? "#34d399" : "#f87171", textAlign: "right" }}>{delta >= 0 ? "+" : ""}{delta.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
        <Sec icon="⚡">Quick Set Scenario B</Sec>
        <div style={{ display: "grid", gap: 5, marginBottom: 16 }}>
          {[
            { label: "At $190k salary", action: () => { setBSalary(11209); setBFood(700); setBamazon(400); setBSavings(400); setBTopup(600); setBRental(0); setBSharesMonthly(200); }, color: "#34d399" },
            { label: "$190k + property rented $400/wk", action: () => { setBSalary(11209); setBFood(700); setBamazon(400); setBSavings(800); setBTopup(1000); setBRental(1733); setBSharesMonthly(300); }, color: "#fbbf24" },
            { label: "Aggressive growth", action: () => { setBSalary(11209); setBFood(650); setBamazon(300); setBMisc(200); setBSavings(500); setBTopup(800); setBSharesMonthly(500); }, color: "#f97316" },
          ].map((s, i) => (
            <button key={i} onClick={s.action} style={{ padding: "10px 14px", borderRadius: 10, background: `${s.color}08`, border: `1px solid ${s.color}15`, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</span>
            </button>
          ))}
        </div>
        <Sec icon="🎛️">Scenario B Sliders</Sec>
        <Slider label="Salary (net/mo)" value={bSalary} onChange={setBSalary} min={10188} max={15000} step={100} color="#34d399" />
        <Slider label="Rental income (67 Leam Rd weekly)" value={bRental} onChange={setBRental} min={0} max={2500} step={50} color="#14b8a6" sub={bRental > 0 ? `$${bRental}/wk` : "None"} prefix="$" />
        <Slider label="Health" value={bHealth} onChange={setBHealth} min={200} max={1500} step={50} color="#06b6d4" />
        <Slider label="Transport" value={bTransport} onChange={setBTransport} min={200} max={900} step={25} color="#eab308" />
        <Slider label="Food" value={bFood} onChange={setBFood} min={400} max={1200} step={50} color="#ec4899" />
        <Slider label="Amazon" value={bAmazon} onChange={setBamazon} min={0} max={1500} step={50} color="#f97316" />
        <Slider label="PayPal" value={bPaypal} onChange={setBPaypal} min={0} max={1000} step={50} color="#6366f1" />
        <Slider label="Misc" value={bMisc} onChange={setBMisc} min={0} max={1500} step={50} color="#94a3b8" />
        <Slider label="Savings transfer" value={bSavings} onChange={setBSavings} min={0} max={2000} step={50} color="#60a5fa" />
        <Slider label="Extra on top-up" value={bTopup} onChange={setBTopup} min={0} max={2000} step={50} color="#f97316" />
        <Slider label="Shares monthly" value={bSharesMonthly} onChange={setBSharesMonthly} min={0} max={2000} step={50} color="#a78bfa" />
        <Sec icon="📈">5-Year Net Worth</Sec>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <St label="A (5yr)" value={"$" + (plan.netWorth5yr / 1000).toFixed(0) + "k"} accent="#a78bfa" />
          <St label="B (5yr)" value={"$" + (planB.netWorth5yr / 1000).toFixed(0) + "k"} accent="#34d399" />
          <St label="Δ 5yr" value={(planB.netWorth5yr - plan.netWorth5yr >= 0 ? "+$" : "-$") + Math.abs((planB.netWorth5yr - plan.netWorth5yr) / 1000).toFixed(0) + "k"} accent={planB.netWorth5yr > plan.netWorth5yr ? "#34d399" : "#f87171"} />
        </div>
      </div>)}

      {/* ═══ GROWTH ═══ */}
      {tab === "growth" && (<div>
        <Sec icon="📈">Shares Compound Growth</Sec>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <St small label="Cash 0%" value={"$" + ((growthData[growthData.length - 1]?.cash || 0) / 1000).toFixed(0) + "k"} accent="#64748b" />
          <St small label="Index 7%" value={"$" + ((growthData[growthData.length - 1]?.r7 || 0) / 1000).toFixed(0) + "k"} accent="#60a5fa" />
          <St small label="Growth 10%" value={"$" + ((growthData[growthData.length - 1]?.r10 || 0) / 1000).toFixed(0) + "k"} accent="#34d399" />
          <St small label="Aggr. 15%" value={"$" + ((growthData[growthData.length - 1]?.r15 || 0) / 1000).toFixed(0) + "k"} accent="#fbbf24" />
        </div>
        <Ch height={210}>
          <LineChart data={growthData} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>
            {gd}<XAxis dataKey="yr" {...xP} /><YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<Tip />} />
            <Line dataKey="cash" name="Cash 0%" stroke="#475569" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            <Line dataKey="r7" name="Index 7%" stroke="#60a5fa" strokeWidth={2} dot={false} />
            <Line dataKey="r10" name="Growth 10%" stroke="#34d399" strokeWidth={2} dot={false} />
            <Line dataKey="r15" name="Aggressive 15%" stroke="#fbbf24" strokeWidth={2} dot={false} />
          </LineChart>
        </Ch>
        <Slider label="Monthly contribution" value={growthMonthly} onChange={setGrowthMonthly} min={0} max={2000} step={50} color="#60a5fa" />
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[5, 10, 15, 20].map(y => (
            <button key={y} onClick={() => setGrowthYears(y)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, background: growthYears === y ? "rgba(96,165,250,0.15)" : "rgba(255,255,255,0.03)", color: growthYears === y ? "#93c5fd" : "#64748b" }}>{y}yr</button>
          ))}
        </div>
        <Note color="#60a5fa">Starting from ${sharesValue.toLocaleString()}. At 7%, ${growthMonthly.toLocaleString()}/mo grows to ${((growthData[growthData.length - 1]?.r7 || 0) / 1000).toFixed(0)}k in {growthYears} years.</Note>
        <Sec icon="⚖️">Debt Priority Calculator</Sec>
        <Slider label="Extra cash per month" value={extraCash} onChange={setExtraCash} min={0} max={2000} step={50} color="#fbbf24" sub="Where does this do the most work over 10 years?" />
        <div style={{ display: "grid", gap: 6 }}>
          {debtPriority.strategies.map((s, i) => {
            const maxBenefit = debtPriority.strategies[0].benefit;
            return (
              <div key={i} style={{ padding: "10px 14px", borderRadius: 10, background: i === 0 ? `${s.color}0a` : "rgba(255,255,255,0.02)", border: `1px solid ${i === 0 ? s.color + "25" : "rgba(255,255,255,0.04)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: i === 0 ? 700 : 400, color: i === 0 ? s.color : "#94a3b8" }}>{s.label}{i === 0 && <span style={{ fontSize: 9, marginLeft: 6, color: s.color }}> ★ Best</span>}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: s.color }}>${s.benefit.toLocaleString()}</span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${(s.benefit / maxBenefit) * 100}%`, height: "100%", background: s.color, opacity: 0.6, borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 3 }}>{s.detail}</div>
              </div>
            );
          })}
        </div>
        <Note color="#fbbf24"><span style={{ color: "#fbbf24", fontWeight: 700 }}>Shares assumed 7%/yr. </span>Debt savings are guaranteed; shares returns are not. 10-year horizon.</Note>
      </div>)}

      {/* ═══ HEATMAP ═══ */}
      {tab === "heatmap" && (<div>
        {!upData ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>No data yet</div>
            <div style={{ fontSize: 13 }}>Connect your Up Bank CSV in the ⚙️ Settings tab to see your daily spending heatmap.</div>
          </div>
        ) : (() => {
          const { minDate, maxDate } = upData.dateRange;
          // Build list of all days in range
          const days = [];
          const cur = new Date(minDate); cur.setHours(0,0,0,0);
          const end = new Date(maxDate); end.setHours(0,0,0,0);
          // Pad to previous Monday
          while (cur.getDay() !== 1) cur.setDate(cur.getDate() - 1);
          while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
          // Pad to end of week
          while (days[days.length-1].getDay() !== 0) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

          const maxSpend = Math.max(...Object.values(dailyTotals), 1);
          const toKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const DAYS = ['M','T','W','T','F','S','S'];
          const weeks = [];
          for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i+7));

          // Month label positions
          const monthLabels = [];
          weeks.forEach((wk, wi) => {
            const d = wk[0];
            if (wi === 0 || d.getDate() <= 7) monthLabels[wi] = d.toLocaleString('default',{month:'short'});
          });

          const allAmounts = Object.values(dailyTotals);
          const totalSpend = allAmounts.reduce((s,v)=>s+v,0);
          const daysWithSpend = allAmounts.length;
          const maxDay = Object.entries(dailyTotals).sort((a,b)=>b[1]-a[1])[0];

          const [hoverDay, setHoverDay] = useState(null);

          return (<>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              <St label="Total period spend" value={"$" + Math.round(totalSpend).toLocaleString()} accent="#f87171" />
              <St label="Highest day" value={maxDay ? "$" + Math.round(maxDay[1]).toLocaleString() : "—"} sub={maxDay ? maxDay[0] : ""} accent="#fbbf24" />
              <St label="Avg active day" value={"$" + (daysWithSpend > 0 ? Math.round(totalSpend/daysWithSpend).toLocaleString() : "0")} accent="#60a5fa" />
            </div>
            <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 16, overflowX: "auto" }}>
              <div style={{ display: "flex", gap: 3, marginBottom: 4, paddingLeft: 20 }}>
                {weeks.map((_, wi) => (
                  <div key={wi} style={{ width: 14, fontSize: 9, color: "#334155", textAlign: "center", flexShrink: 0 }}>
                    {monthLabels[wi] || ""}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginRight: 2 }}>
                  {DAYS.map((d,i) => <div key={i} style={{ height: 14, fontSize: 9, color: "#475569", lineHeight: "14px" }}>{d}</div>)}
                </div>
                {weeks.map((wk, wi) => (
                  <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {wk.map((day, di) => {
                      const key = toKey(day);
                      const amt = dailyTotals[key] || 0;
                      const intensity = amt > 0 ? 0.12 + (amt / maxSpend) * 0.88 : 0;
                      const isInRange = day >= minDate && day <= maxDate;
                      return (
                        <div key={di}
                          onMouseEnter={() => setHoverDay({ key, amt })}
                          onMouseLeave={() => setHoverDay(null)}
                          style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, cursor: amt > 0 ? "pointer" : "default",
                            background: !isInRange ? "transparent" : amt > 0 ? `rgba(239,68,68,${intensity})` : "rgba(255,255,255,0.04)",
                            border: hoverDay?.key === key ? "1px solid rgba(239,68,68,0.8)" : "1px solid transparent",
                          }} />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#475569" }}>
                <span>Less</span>
                {[0.1,0.3,0.5,0.7,0.9].map(v => <div key={v} style={{ width: 12, height: 12, borderRadius: 2, background: `rgba(239,68,68,${v})` }} />)}
                <span>More</span>
              </div>
              {hoverDay && hoverDay.amt > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{hoverDay.key}</span> — <span style={{ color: "#f87171", fontFamily: "'JetBrains Mono',monospace" }}>${Math.round(hoverDay.amt).toLocaleString()}</span> spent
                </div>
              )}
            </div>
          </>);
        })()}
      </div>)}

      {/* ═══ SEARCH ═══ */}
      {tab === "search" && (<div>
        {!upData ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#64748b", marginBottom: 8 }}>No data yet</div>
            <div style={{ fontSize: 13 }}>Connect your Up Bank CSV in the ⚙️ Settings tab to search your transactions.</div>
          </div>
        ) : (<>
          <input
            type="text" placeholder="Search transactions…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {['all','amazon','paypal','restaurant','takeaway','grocery','health','transport','toll','sub'].map(cat => (
              <button key={cat} onClick={() => setSearchCat(cat)}
                style={{ padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  background: searchCat === cat ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.05)",
                  color: searchCat === cat ? "#93c5fd" : "#64748b" }}>
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12, color: "#475569" }}>
            <span>{filteredTxs.length} transactions</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#f87171" }}>
              ${filteredTxs.reduce((s,t)=>s+t.amount,0).toLocaleString(undefined,{maximumFractionDigits:0})} total
            </span>
          </div>
          <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", overflow: "hidden", maxHeight: 520, overflowY: "auto" }}>
            {filteredTxs.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#475569", fontSize: 13 }}>No matching transactions</div>
            ) : filteredTxs.map((tx, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                <div style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0, width: 82 }}>{tx.date}</div>
                <div style={{ flex: 1, fontSize: 12, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</div>
                <Badge text={tx.cat || "other"} color="#60a5fa" />
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: "#f87171", flexShrink: 0 }}>${tx.amount.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
              </div>
            ))}
          </div>
        </>)}
      </div>)}

      {/* ═══ SETTINGS ═══ */}
      {tab === "settings" && (<div>
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.1)", fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>
          In Google Sheets: <strong style={{ color: "#e2e8f0" }}>File → Share → Publish to web → select tab → CSV format → Copy link</strong>
        </div>
        {[
          { key: 'upbankUrl',      label: 'Up Bank',                  src: 'up', drives: 'Overview · Health · Variable · Insights · Deep Dive' },
          { key: 'paypalUrl',      label: 'PayPal',                   src: 'pp', drives: 'PayPal tab' },
          { key: 'gatewayMainUrl', label: 'Gateway Bank — Main Loan', src: 'gw', drives: 'Property tab' },
          { key: 'gatewayTopUrl',  label: 'Gateway Bank — Top-Up',    src: 'gw', drives: 'Property tab' },
          { key: 'commsecUrl',     label: 'CommSec',                  src: 'cs', drives: 'Net Worth tab' },
        ].map(({ key, label, src, drives }) => {
          const status = srcStatus[src];
          const error  = srcError[src];
          const data   = src === 'up' ? upData : src === 'pp' ? ppData : src === 'gw' ? gwData : csData;
          const chip = !draftConfig[key]        ? { t: '⚪ Not configured', c: '#475569' }
                     : status === 'loading'     ? { t: '⏳ Loading…',       c: '#fbbf24' }
                     : status === 'loaded'      ? { t: `🟢 Loaded — ${data?.rowCount ?? '?'} rows`, c: '#34d399' }
                     : status === 'error'       ? { t: `🔴 ${error}`,       c: '#f87171' }
                     :                           { t: '⚪ Saved',            c: '#64748b' };
          return (
            <div key={key} style={{ marginBottom: 14, padding: 14, borderRadius: 12, background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{label}</div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{drives}</div>
                </div>
                <span style={{ fontSize: 10, color: chip.c, fontWeight: 600, flexShrink: 0, marginLeft: 8 }}>{chip.t}</span>
              </div>
              <input
                type="text"
                value={draftConfig[key] || ''}
                onChange={e => setDraftConfig(d => ({ ...d, [key]: e.target.value }))}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontSize: 11, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          );
        })}
        <button
          onClick={() => { const cfg = { ...draftConfig }; localStorage.setItem('sheetConfig', JSON.stringify(cfg)); setSheetConfig(cfg); }}
          style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(96,165,250,0.15)', color: '#93c5fd', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
        >
          Save &amp; Reload
        </button>
      </div>)}

      <div style={{ marginTop: 32, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.03)", textAlign: "center" }}><div style={{ color: "#1e293b", fontSize: 9 }}>Up Bank + PayPal + Gateway + CommSec</div></div>
      </div>{/* end main content */}
    </div>
  );
}

// ─── PIN GATE ─────────────────────────────────────────────────────────────────
const CORRECT_PIN = '1234'; // ← change this to your PIN

export default function Dashboard() {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [unlocked, setUnlocked] = useState(
    () => sessionStorage.getItem('dashPin') === CORRECT_PIN
  );

  const tryUnlock = (val) => {
    if (val === CORRECT_PIN) {
      sessionStorage.setItem('dashPin', CORRECT_PIN);
      setUnlocked(true);
    } else if (val.length >= CORRECT_PIN.length) {
      setPinError(true);
      setTimeout(() => { setPinError(false); setPinInput(''); }, 600);
    }
  };

  if (unlocked) return <DashboardInner />;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0b0b17", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", width: 280 }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <div style={{ color: "#f1f5f9", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Financial Dashboard</div>
        <div style={{ color: "#475569", fontSize: 12, marginBottom: 28 }}>Enter PIN to continue</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 24 }}>
          {Array.from({ length: CORRECT_PIN.length }).map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${pinError ? "#ef4444" : "#334155"}`, background: pinInput.length > i ? (pinError ? "#ef4444" : "#60a5fa") : "transparent", transition: "all 0.15s" }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {['1','2','3','4','5','6','7','8','9','←','0',''].map((k, idx) => {
            if (idx === 11) return <div key="empty" />;
            const isBack = k === '←';
            return (
              <button key={k || 'back'} onClick={() => {
                if (isBack) { setPinInput(p => p.slice(0, -1)); return; }
                const next = pinInput + k;
                setPinInput(next);
                tryUnlock(next);
              }} style={{ padding: "16px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", background: isBack ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.04)", color: isBack ? "#f87171" : "#e2e8f0", fontSize: isBack ? 16 : 20, fontWeight: 600, cursor: "pointer", fontFamily: "system-ui, sans-serif" }}>
                {k}
              </button>
            );
          })}
        </div>
        {pinError && <div style={{ color: "#f87171", fontSize: 12, marginTop: 16 }}>Incorrect PIN</div>}
      </div>
    </div>
  );
}
