import { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, ReferenceLine, AreaChart, Area, Cell, LineChart, ReferenceDot } from "recharts";
import { processCSVText, parseCSV, processUniversalBank, applyUserRules, aggregateTxs, extractMerchantPattern } from "./dataLoader.js";
import { streamChat, buildFinancialContext } from "./aiProvider.js";

// ─── DEMO DATA ───────────────────────────────────────────────────────────────
// Fictional persona: Alex & Jordan Chen, 14 Banksia Drive, Brunswick VIC 3056
// Alex: Horizon Group ($115k gross, ~$7,107/mo net, fortnightly $3,280)
// Jordan: Freelance graphic designer (~$50k avg, irregular $2k–$6k/mo)
export const DEMO_DATA = {
  profile: {
    names: "Alex & Jordan Chen",
    address: "14 Banksia Drive, Brunswick, Melbourne VIC 3056",
    alexEmployer: "Horizon Group",
    jordanWork: "Freelance graphic designer",
    combinedIncomeGross: 165000,
    alexSalaryGross: 115000,
    alexNetMonthly: 7107,
    jordanNetAvg: 3653,
    householdNetMonthly: 10760,
    committedTotal: 6455,
    // Balances
    mainMortgage: 377922,
    topupLoan: 50000,
    sharesPortfolioValue: 15000,
    vehicleValue: 18000,
    vehicleLabel: "Motorcycle",
    vehiclePurchase: 21477,
    propertyValue: 820000,
    propertyShortName: "14 Banksia Dr",
    // Planner slider defaults / scenario values
    plannerSalaryMin: 10188,
    plannerSalaryTarget: 11209,
    plannerRentalScenario: 1733,
    medicareRebateMonthly: 300,
    overviewHealthMonthly: 500,
    overviewTransportMonthly: 526,
    foodMonthlyBudget: 813,
    amazonRecentAvg: 565,
    // Health
    healthHistorical: 17782,
    // PayPal totals
    ppGross: 17533,
    ppRefunds: 2023,
    ppNet: 15509,
    // Savings
    savingsDrawn: 38408,
    savingsMonthlyAvg: 4801,
    // Mortgage details
    mainInterestMonthly: 1792,
    topupInterestMonthly: 227,
    ratesMonthly: 292,
    lpgMonthly: 105,
    principalMonthly: 153,
    interestToPaymentPct: 92.5,
    mainMortgageRatePct: 5.81,
    topupLoanRatePct: 6.06,
    // One-offs
    atoRefund: 14275,
    drivewayCost: 28500,
    surgeryOop: 5642,
    // Vehicle ROI
    vehicleRoiTollSave: 207,
    vehicleRoiInterest: 108,
    vehicleRoiNet: 99,
    vehicleRoiBreakEven: "~18yr",
  },
  trendStats: { deficit8mo: 4780, forward: 400, julDec: 2944, janFeb: 565 },
  insightStats: { sunAvg: 244, monAvg: 206 },
  actioned: [
    { a: "Pay in 4 cleared", s: "+$1,510" },
    { a: "Amazon cut", s: "+$868" },
    { a: "Subs cut", s: "+$75" },
    { a: "Vehicle tolls (net)", s: "+$99" },
    { a: "Health (fwd)", s: "+$503" },
  ],
  pnl: [
    {m:"Sep",i:10927,s:11380,n:-453},
    {m:"Oct",i:12587,s:9840,n:2747},
    {m:"Nov",i:10047,s:11190,n:-1143},
    {m:"Dec",i:9287,s:13820,n:-4533},
    {m:"Jan",i:11207,s:9480,n:1727},
    {m:"Feb",i:12967,s:9720,n:3247},
  ],
  cd: [
    {m:"Sep",a:280,p:0},
    {m:"Oct",a:190,p:0},
    {m:"Nov",a:450,p:580},
    {m:"Dec",a:380,p:1200},
    {m:"Jan",a:120,p:580},
    {m:"Feb",a:85,p:0},
  ],
  amz: [
    {m:"Sep",v:280},{m:"Oct",v:190},{m:"Nov",v:450},
    {m:"Dec",v:380},{m:"Jan",v:120},{m:"Feb",v:85},
  ],
  food: [
    {m:"Sep",r:380,t:210,g:720},
    {m:"Oct",r:420,t:180,g:680},
    {m:"Nov",r:510,t:240,g:760},
    {m:"Dec",r:890,t:320,g:840},
    {m:"Jan",r:290,t:160,g:640},
    {m:"Feb",r:350,t:190,g:710},
  ],
  hm: [
    {m:"Sep",rec:285,one:0,mc:80},
    {m:"Oct",rec:285,one:120,mc:80},
    {m:"Nov",rec:285,one:0,mc:80},
    {m:"Dec",rec:285,one:200,mc:80},
    {m:"Jan",rec:285,one:0,mc:80},
    {m:"Feb",rec:285,one:380,mc:80},
  ],
  hcats: [
    {n:"Medibank Private",t:1710,c:"#06b6d4",no:"$285/mo"},
    {n:"Pharmacy",t:680,c:"#f97316"},
    {n:"Dental",t:380,c:"#ec4899",no:"2 checkups"},
    {n:"GP & Specialists",t:420,c:"#8b5cf6"},
    {n:"Eye care",t:240,c:"#34d399"},
    {n:"Physio",t:180,c:"#22c55e"},
  ],
  tolls: [
    {m:"Sep",v:185},{m:"Oct",v:210},{m:"Nov",v:195},
    {m:"Dec",v:230},{m:"Jan",v:145},{m:"Feb",v:198},
  ],
  glob: [
    {m:"Sep",v:145},{m:"Oct",v:188},{m:"Nov",v:220},
    {m:"Dec",v:380},{m:"Jan",v:115},{m:"Feb",v:165},
  ],
  cc: [
    {n:"Mortgage (ANZ)",a:4850,no:"6.19% variable"},
    {n:"Car loan (Toyota)",a:450,no:"$12k remaining"},
    {n:"Medibank Private",a:285,no:"Hospital gold + extras"},
    {n:"Car insurance",a:140,no:"Comprehensive"},
    {n:"Home & contents",a:92},
    {n:"AGL (electricity)",a:155},
    {n:"Yarra Valley Water",a:65},
    {n:"Aussie Broadband",a:89,no:"250Mbps nbn"},
    {n:"Telstra (mobiles)",a:105,no:"Alex + Jordan"},
    {n:"Subs (monthly)",a:183},
    {n:"Subs (annual avg)",a:41},
  ],
  sm: [
    {n:"Adobe CC",c:89.99,t:"e",no:"Jordan's design"},
    {n:"Netflix",c:22.99,t:"d",no:"Standard"},
    {n:"Kayo Sports",c:25,t:"d"},
    {n:"YouTube Premium",c:14.99,t:"d",no:"Family"},
    {n:"Stan",c:14,t:"d"},
    {n:"Spotify",c:11.99,t:"d",no:"Family"},
    {n:"iCloud+",c:4.49,t:"e",no:"200GB"},
  ],
  sa: [
    {n:"Amazon Prime",c:119.88,f:"Annual",mo:10,t:"d"},
    {n:"Canva Pro",c:192,f:"Annual",mo:16,t:"e",no:"Jordan"},
    {n:"Dropbox Plus",c:144,f:"Annual",mo:12,t:"e",no:"Jordan"},
    {n:"1Password",c:59.88,f:"Annual",mo:5,t:"e"},
    {n:"Domain.com.au",c:89,f:"Jul",mo:7,t:"r"},
  ],
  ppCats: [
    {n:"Home & Garden",t:2180,ct:8,c:"#34d399"},
    {n:"Electronics",t:1640,ct:3,c:"#6366f1"},
    {n:"Clothing",t:1120,ct:6,c:"#ec4899"},
    {n:"Travel & Events",t:1480,ct:4,c:"#fbbf24"},
    {n:"Sporting goods",t:820,ct:2,c:"#22c55e"},
    {n:"Health & Beauty",t:640,ct:5,c:"#06b6d4"},
    {n:"Other",t:980,ct:7,c:"#94a3b8"},
  ],
  ppM: [
    {m:"Sep",pi4:0,p:0},
    {m:"Oct",pi4:0,p:0},
    {m:"Nov",pi4:580,p:0},
    {m:"Dec",pi4:1200,p:840},
    {m:"Jan",pi4:580,p:0},
    {m:"Feb",pi4:0,p:0},
  ],
  sdr: [
    {m:"Sep",inv:0,sav:500,oth:0},
    {m:"Oct",inv:500,sav:500,oth:0},
    {m:"Nov",inv:0,sav:500,oth:0},
    {m:"Dec",inv:0,sav:0,oth:0},
    {m:"Jan",inv:500,sav:500,oth:0},
    {m:"Feb",inv:500,sav:1000,oth:0},
  ],
  saf: [
    {m:"Sep",rent:3820,o:0},
    {m:"Oct",rent:5480,o:200},
    {m:"Nov",rent:2940,o:0},
    {m:"Dec",rent:2180,o:0},
    {m:"Jan",rent:4100,o:0},
    {m:"Feb",rent:5860,o:320},
  ],
  mortBal: [
    {m:"Sep'25",main:720000,top:0},
    {m:"Oct'25",main:718864,top:0},
    {m:"Nov'25",main:717722,top:0},
    {m:"Dec'25",main:716576,top:0},
    {m:"Jan'26",main:715426,top:0},
    {m:"Feb'26",main:714272,top:0},
    {m:"Mar'26",main:713114,top:0},
  ],
  shares: [
    {code:"VAS",value:6800,pl:420,pct:45.3,color:"#34d399"},
    {code:"VGS",value:5100,pl:310,pct:34.0,color:"#60a5fa"},
    {code:"NDQ",value:3100,pl:270,pct:20.7,color:"#fbbf24"},
  ],
  topupPayoff: [
    {m:0,b6:12000,b4:12000,b2:12000},
    {m:6,b6:5580,b4:7180,b2:8900},
    {m:12,b6:0,b4:1060,b2:5420},
    {m:18,b6:0,b4:0,b2:1460},
    {m:24,b6:0,b4:0,b2:0},
  ],
  dow: [
    {d:"Mon",avg:142},{d:"Tue",avg:98},{d:"Wed",avg:115},
    {d:"Thu",avg:134},{d:"Fri",avg:218},{d:"Sat",avg:285},{d:"Sun",avg:176},
  ],
  bva: [
    {m:"Sep",amazon:280,delivery:180,tolls:185,coffee:92},
    {m:"Oct",amazon:190,delivery:220,tolls:210,coffee:88},
    {m:"Nov",amazon:450,delivery:195,tolls:195,coffee:104},
    {m:"Dec",amazon:380,delivery:280,tolls:230,coffee:128},
    {m:"Jan",amazon:120,delivery:165,tolls:145,coffee:76},
    {m:"Feb",amazon:85,delivery:195,tolls:198,coffee:84},
  ],
  upcoming: [
    {n:"Car registration (VIC)",a:890,d:"~Mar",c:"#f97316"},
    {n:"Amazon Prime",a:120,d:"~Apr",c:"#f87171"},
    {n:"Council rates (Q3)",a:620,d:"Jun",c:"#eab308"},
    {n:"Adobe CC (annual)",a:1080,d:"~Oct",c:"#34d399"},
    {n:"Home insurance renewal",a:1140,d:"Sep",c:"#60a5fa"},
  ],
  hoursData: [
    {n:"Mortgage interest (6mo)",cost:21000,hrs:480,days:63.2},
    {n:"Groceries (6mo)",cost:4350,hrs:99.5,days:13.1},
    {n:"Dining out (6mo)",cost:2840,hrs:65,days:8.6},
    {n:"Online shopping (6mo)",cost:1505,hrs:34.4,days:4.5},
    {n:"Coffee (6mo)",cost:572,hrs:13.1,days:1.7},
  ],
  compound: [
    {n:"Dining out",mo:473,yr10:56760,inv:80840},
    {n:"Groceries",mo:725,yr10:87000,inv:123890},
    {n:"Online shopping",mo:251,yr10:30120,inv:42891},
    {n:"Subscriptions",mo:231,yr10:27720,inv:39483},
    {n:"Coffee",mo:95,yr10:11400,inv:16233},
  ],
  scorecard: [
    {m:"Sep",g:"C",cl:"#fbbf24"},
    {m:"Oct",g:"B",cl:"#60a5fa"},
    {m:"Nov",g:"C",cl:"#fbbf24"},
    {m:"Dec",g:"F",cl:"#ef4444"},
    {m:"Jan",g:"B",cl:"#60a5fa"},
    {m:"Feb",g:"A",cl:"#34d399"},
  ],
  velocity: [
    {d:"Day 5",Oct:820,Dec:2940,Jan:670,Feb:580},
    {d:"Day 10",Oct:1680,Dec:5820,Jan:1490,Feb:1280},
    {d:"Day 15",Oct:4280,Dec:8740,Jan:4180,Feb:3960},
    {d:"Day 20",Oct:6940,Dec:11280,Jan:7420,Feb:6840},
    {d:"Day 25",Oct:8640,Dec:13140,Jan:9180,Feb:8640},
    {d:"Day 30",Oct:9840,Dec:13820,Jan:9480,Feb:9720},
  ],
  // Transactions: Up Bank-style entries Sep'25–Feb'26 (for future wiring)
  transactions: [
    // September 2025
    {date:"2025-09-01",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:94.30},
    {date:"2025-09-02",desc:"☕ Patricia Coffee Roasters",cat:"restaurant",amount:8.50},
    {date:"2025-09-03",desc:"🚌 Myki Top-up",cat:"transport",amount:50.00},
    {date:"2025-09-04",desc:"🍽️ Tipo 00",cat:"restaurant",amount:82.00},
    {date:"2025-09-05",desc:"📱 Telstra",cat:"sub",amount:105.00},
    {date:"2025-09-06",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:112.40},
    {date:"2025-09-07",desc:"🚘 CityLink toll",cat:"toll",amount:18.50},
    {date:"2025-09-08",desc:"⚡ AGL Energy",cat:"sub",amount:155.00},
    {date:"2025-09-09",desc:"☕ Market Lane Coffee",cat:"restaurant",amount:9.20},
    {date:"2025-09-10",desc:"💊 Chemist Warehouse Coburg",cat:"health",amount:34.60},
    {date:"2025-09-11",desc:"⛽ 7-Eleven Sydney Rd",cat:"transport",amount:82.40},
    {date:"2025-09-12",desc:"📱 Netflix",cat:"sub",amount:22.99},
    {date:"2025-09-12",desc:"📱 Spotify",cat:"sub",amount:11.99},
    {date:"2025-09-13",desc:"🛒 Coles Brunswick",cat:"grocery",amount:78.20},
    {date:"2025-09-14",desc:"💧 Yarra Valley Water",cat:"sub",amount:65.00},
    {date:"2025-09-15",desc:"🛒 Harris Farm Markets",cat:"grocery",amount:52.30},
    {date:"2025-09-16",desc:"📺 Kayo Sports",cat:"sub",amount:25.00},
    {date:"2025-09-17",desc:"☕ Aunty Peg's Coffee",cat:"restaurant",amount:7.80},
    {date:"2025-09-18",desc:"🛒 Woolworths Metro Brunswick",cat:"grocery",amount:67.80},
    {date:"2025-09-19",desc:"🛍️ Bunnings Warehouse",cat:"shopping",amount:156.40},
    {date:"2025-09-20",desc:"🍔 Easeys Collingwood",cat:"restaurant",amount:48.50},
    {date:"2025-09-21",desc:"⛽ BP Coburg",cat:"transport",amount:74.20},
    {date:"2025-09-22",desc:"📱 YouTube Premium",cat:"sub",amount:14.99},
    {date:"2025-09-23",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:88.60},
    {date:"2025-09-24",desc:"☕ Dukes Coffee Roasters",cat:"restaurant",amount:9.50},
    {date:"2025-09-25",desc:"🛍️ Kmart Preston",cat:"shopping",amount:62.40},
    {date:"2025-09-26",desc:"🚘 EastLink toll",cat:"toll",amount:14.30},
    {date:"2025-09-27",desc:"🛒 Coles Brunswick",cat:"grocery",amount:71.50},
    {date:"2025-09-28",desc:"🥐 Lune Croissanterie",cat:"restaurant",amount:28.00},
    {date:"2025-09-29",desc:"📱 iCloud+",cat:"sub",amount:4.49},
    {date:"2025-09-30",desc:"🏋️ Fitzroy North Gym",cat:"health",amount:52.00},
    // October 2025
    {date:"2025-10-01",desc:"☕ Seven Seeds Carlton",cat:"restaurant",amount:8.50},
    {date:"2025-10-02",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:98.20},
    {date:"2025-10-03",desc:"🏥 Medibank Private",cat:"health",amount:285.00},
    {date:"2025-10-04",desc:"⛽ Shell Sydney Rd",cat:"transport",amount:88.60},
    {date:"2025-10-05",desc:"🍽️ Supernormal",cat:"restaurant",amount:124.00},
    {date:"2025-10-06",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:102.30},
    {date:"2025-10-07",desc:"☕ Market Lane Coffee",cat:"restaurant",amount:9.80},
    {date:"2025-10-08",desc:"🚌 Myki Top-up",cat:"transport",amount:30.00},
    {date:"2025-10-09",desc:"📦 Amazon AU",cat:"amazon",amount:89.95},
    {date:"2025-10-10",desc:"🛒 Coles Brunswick",cat:"grocery",amount:84.70},
    {date:"2025-10-11",desc:"🚘 CityLink toll",cat:"toll",amount:22.40},
    {date:"2025-10-12",desc:"📱 Adobe CC",cat:"sub",amount:89.99},
    {date:"2025-10-13",desc:"🛒 Harris Farm Markets",cat:"grocery",amount:64.40},
    {date:"2025-10-14",desc:"☕ Aunty Peg's Coffee",cat:"restaurant",amount:8.20},
    {date:"2025-10-15",desc:"🥐 Lune Croissanterie",cat:"restaurant",amount:32.00},
    {date:"2025-10-16",desc:"⛽ 7-Eleven Sydney Rd",cat:"transport",amount:76.80},
    {date:"2025-10-17",desc:"🛍️ Officeworks Coburg",cat:"shopping",amount:78.50},
    {date:"2025-10-18",desc:"🛒 Woolworths Metro Brunswick",cat:"grocery",amount:76.30},
    {date:"2025-10-19",desc:"🎪 Melbourne Night Bazaar",cat:"restaurant",amount:68.00},
    {date:"2025-10-20",desc:"☕ Patricia Coffee Roasters",cat:"restaurant",amount:9.20},
    {date:"2025-10-21",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:95.60},
    {date:"2025-10-22",desc:"📦 Amazon AU",cat:"amazon",amount:99.90},
    {date:"2025-10-23",desc:"🚘 EastLink toll",cat:"toll",amount:16.80},
    {date:"2025-10-24",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:82.40},
    {date:"2025-10-25",desc:"🍔 Huxtaburger Fitzroy",cat:"takeaway",amount:38.50},
    {date:"2025-10-26",desc:"☕ Dukes Coffee Roasters",cat:"restaurant",amount:8.80},
    {date:"2025-10-27",desc:"💊 Chemist Warehouse Coburg",cat:"health",amount:42.80},
    {date:"2025-10-28",desc:"🚌 Myki Top-up",cat:"transport",amount:30.00},
    {date:"2025-10-29",desc:"🛒 Coles Brunswick",cat:"grocery",amount:72.10},
    {date:"2025-10-30",desc:"🍽️ Longrain Melbourne",cat:"restaurant",amount:98.00},
    // November 2025
    {date:"2025-11-01",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:91.20},
    {date:"2025-11-02",desc:"☕ Market Lane Coffee",cat:"restaurant",amount:8.90},
    {date:"2025-11-03",desc:"🏥 Medibank Private",cat:"health",amount:285.00},
    {date:"2025-11-04",desc:"📦 Amazon AU",cat:"amazon",amount:145.00},
    {date:"2025-11-05",desc:"⛽ 7-Eleven Sydney Rd",cat:"transport",amount:84.20},
    {date:"2025-11-06",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:108.40},
    {date:"2025-11-07",desc:"🚘 CityLink toll",cat:"toll",amount:19.60},
    {date:"2025-11-08",desc:"🛍️ Bunnings Warehouse",cat:"shopping",amount:234.80},
    {date:"2025-11-09",desc:"☕ Seven Seeds Carlton",cat:"restaurant",amount:9.40},
    {date:"2025-11-10",desc:"🍽️ Tipo 00",cat:"restaurant",amount:94.00},
    {date:"2025-11-11",desc:"🛒 Harris Farm Markets",cat:"grocery",amount:68.20},
    {date:"2025-11-12",desc:"⛽ BP Coburg",cat:"transport",amount:79.60},
    {date:"2025-11-13",desc:"📦 Amazon AU",cat:"amazon",amount:189.00},
    {date:"2025-11-14",desc:"🛒 Woolworths Metro Brunswick",cat:"grocery",amount:84.60},
    {date:"2025-11-15",desc:"🚌 Myki Top-up",cat:"transport",amount:50.00},
    {date:"2025-11-16",desc:"☕ Aunty Peg's Coffee",cat:"restaurant",amount:8.20},
    {date:"2025-11-17",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:98.80},
    {date:"2025-11-18",desc:"🛍️ Target Northland",cat:"shopping",amount:112.50},
    {date:"2025-11-19",desc:"🍔 Lord of the Fries",cat:"takeaway",amount:24.50},
    {date:"2025-11-20",desc:"🚘 EastLink toll",cat:"toll",amount:18.40},
    {date:"2025-11-21",desc:"🛒 Coles Brunswick",cat:"grocery",amount:76.40},
    {date:"2025-11-22",desc:"☕ Patricia Coffee Roasters",cat:"restaurant",amount:9.00},
    {date:"2025-11-23",desc:"📦 Amazon AU",cat:"amazon",amount:116.00},
    {date:"2025-11-24",desc:"🍕 Gennaro's Pasta Bar",cat:"restaurant",amount:72.00},
    {date:"2025-11-25",desc:"⛽ 7-Eleven Sydney Rd",cat:"transport",amount:88.00},
    {date:"2025-11-26",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:79.30},
    {date:"2025-11-27",desc:"🎭 Melbourne Theatre Co",cat:"restaurant",amount:185.00},
    {date:"2025-11-28",desc:"🛍️ Officeworks Coburg",cat:"shopping",amount:64.20},
    {date:"2025-11-29",desc:"🚘 CityLink toll",cat:"toll",amount:21.80},
    {date:"2025-11-30",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:94.50},
    // December 2025
    {date:"2025-12-01",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:104.60},
    {date:"2025-12-02",desc:"☕ Market Lane Coffee",cat:"restaurant",amount:9.80},
    {date:"2025-12-03",desc:"🏥 Medibank Private",cat:"health",amount:285.00},
    {date:"2025-12-04",desc:"🛍️ Kmart Preston",cat:"shopping",amount:168.40},
    {date:"2025-12-05",desc:"⛽ Shell Sydney Rd",cat:"transport",amount:91.20},
    {date:"2025-12-06",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:118.60},
    {date:"2025-12-07",desc:"🚘 CityLink toll",cat:"toll",amount:24.20},
    {date:"2025-12-08",desc:"☕ Dukes Coffee Roasters",cat:"restaurant",amount:10.50},
    {date:"2025-12-09",desc:"🍽️ Vue de Monde",cat:"restaurant",amount:320.00},
    {date:"2025-12-10",desc:"🛒 Harris Farm Markets",cat:"grocery",amount:89.40},
    {date:"2025-12-11",desc:"📦 Amazon AU",cat:"amazon",amount:156.80},
    {date:"2025-12-12",desc:"🛒 Coles Brunswick",cat:"grocery",amount:112.30},
    {date:"2025-12-13",desc:"⛽ BP Coburg",cat:"transport",amount:86.40},
    {date:"2025-12-14",desc:"🛍️ Myer Melbourne",cat:"shopping",amount:245.00},
    {date:"2025-12-15",desc:"🚌 Myki Top-up",cat:"transport",amount:50.00},
    {date:"2025-12-16",desc:"☕ Patricia Coffee Roasters",cat:"restaurant",amount:10.20},
    {date:"2025-12-17",desc:"🛒 Woolworths Metro Brunswick",cat:"grocery",amount:184.20},
    {date:"2025-12-18",desc:"🍷 Dan Murphy's",cat:"shopping",amount:192.50},
    {date:"2025-12-19",desc:"🍔 Grill'd Fitzroy",cat:"takeaway",amount:44.00},
    {date:"2025-12-20",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:142.80},
    {date:"2025-12-21",desc:"🎁 David Jones",cat:"shopping",amount:280.00},
    {date:"2025-12-22",desc:"💊 Chemist Warehouse Coburg",cat:"health",amount:68.40},
    {date:"2025-12-23",desc:"🛒 Coles Brunswick",cat:"grocery",amount:196.40},
    {date:"2025-12-24",desc:"📦 Amazon AU",cat:"amazon",amount:223.00},
    {date:"2025-12-25",desc:"🛒 IGA Coburg",cat:"grocery",amount:58.30},
    {date:"2025-12-26",desc:"🛍️ Bunnings Warehouse",cat:"shopping",amount:124.60},
    {date:"2025-12-27",desc:"🚘 EastLink toll",cat:"toll",amount:26.80},
    {date:"2025-12-28",desc:"☕ Aunty Peg's Coffee",cat:"restaurant",amount:9.40},
    {date:"2025-12-29",desc:"🍽️ Fancy Hanks",cat:"restaurant",amount:88.00},
    {date:"2025-12-30",desc:"⛽ 7-Eleven Sydney Rd",cat:"transport",amount:78.40},
    {date:"2025-12-31",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:86.40},
    // January 2026
    {date:"2026-01-02",desc:"☕ Market Lane Coffee",cat:"restaurant",amount:8.80},
    {date:"2026-01-03",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:94.60},
    {date:"2026-01-04",desc:"🏥 Medibank Private",cat:"health",amount:285.00},
    {date:"2026-01-05",desc:"⛽ BP Coburg",cat:"transport",amount:82.40},
    {date:"2026-01-06",desc:"🚌 Myki Top-up",cat:"transport",amount:50.00},
    {date:"2026-01-07",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:88.20},
    {date:"2026-01-08",desc:"☕ Seven Seeds Carlton",cat:"restaurant",amount:9.00},
    {date:"2026-01-09",desc:"🍽️ Chin Chin",cat:"restaurant",amount:104.00},
    {date:"2026-01-10",desc:"📦 Amazon AU",cat:"amazon",amount:119.90},
    {date:"2026-01-11",desc:"🛒 Coles Brunswick",cat:"grocery",amount:72.40},
    {date:"2026-01-12",desc:"🚘 CityLink toll",cat:"toll",amount:18.20},
    {date:"2026-01-13",desc:"🛒 Harris Farm Markets",cat:"grocery",amount:56.80},
    {date:"2026-01-14",desc:"⛽ 7-Eleven Sydney Rd",cat:"transport",amount:76.00},
    {date:"2026-01-15",desc:"☕ Patricia Coffee Roasters",cat:"restaurant",amount:8.50},
    {date:"2026-01-16",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:88.40},
    {date:"2026-01-17",desc:"🍔 Grill'd Fitzroy",cat:"takeaway",amount:36.50},
    {date:"2026-01-18",desc:"🛍️ Kmart Preston",cat:"shopping",amount:54.80},
    {date:"2026-01-19",desc:"🚘 EastLink toll",cat:"toll",amount:14.60},
    {date:"2026-01-20",desc:"🛒 Woolworths Metro Brunswick",cat:"grocery",amount:76.80},
    {date:"2026-01-21",desc:"☕ Aunty Peg's Coffee",cat:"restaurant",amount:8.20},
    {date:"2026-01-22",desc:"🛒 Coles Brunswick",cat:"grocery",amount:68.60},
    {date:"2026-01-23",desc:"🏋️ Fitzroy North Gym",cat:"health",amount:52.00},
    {date:"2026-01-24",desc:"⛽ Shell Sydney Rd",cat:"transport",amount:84.20},
    {date:"2026-01-25",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:82.40},
    {date:"2026-01-26",desc:"🎪 Midsumma Festival",cat:"restaurant",amount:78.00},
    {date:"2026-01-27",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:91.20},
    {date:"2026-01-28",desc:"🚘 CityLink toll",cat:"toll",amount:16.40},
    {date:"2026-01-29",desc:"☕ Market Lane Coffee",cat:"restaurant",amount:9.20},
    {date:"2026-01-30",desc:"🛒 Coles Brunswick",cat:"grocery",amount:74.40},
    // February 2026
    {date:"2026-02-01",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:96.40},
    {date:"2026-02-02",desc:"☕ Patricia Coffee Roasters",cat:"restaurant",amount:8.80},
    {date:"2026-02-03",desc:"🏥 Medibank Private",cat:"health",amount:285.00},
    {date:"2026-02-04",desc:"⛽ 7-Eleven Sydney Rd",cat:"transport",amount:86.40},
    {date:"2026-02-05",desc:"🚌 Myki Top-up",cat:"transport",amount:50.00},
    {date:"2026-02-06",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:104.60},
    {date:"2026-02-07",desc:"🚘 CityLink toll",cat:"toll",amount:20.80},
    {date:"2026-02-08",desc:"☕ Market Lane Coffee",cat:"restaurant",amount:9.20},
    {date:"2026-02-09",desc:"🦷 Moreland Road Dental",cat:"health",amount:285.00},
    {date:"2026-02-10",desc:"🛒 Harris Farm Markets",cat:"grocery",amount:68.40},
    {date:"2026-02-11",desc:"⛽ BP Coburg",cat:"transport",amount:78.80},
    {date:"2026-02-12",desc:"🍽️ Tipo 00",cat:"restaurant",amount:96.00},
    {date:"2026-02-13",desc:"🛒 Coles Brunswick",cat:"grocery",amount:82.40},
    {date:"2026-02-14",desc:"🌹 Flowers by Beath",cat:"shopping",amount:92.00},
    {date:"2026-02-15",desc:"☕ Seven Seeds Carlton",cat:"restaurant",amount:8.60},
    {date:"2026-02-16",desc:"🛒 Woolworths Metro Brunswick",cat:"grocery",amount:78.20},
    {date:"2026-02-17",desc:"🛍️ Officeworks Coburg",cat:"shopping",amount:46.80},
    {date:"2026-02-18",desc:"🍔 Huxtaburger Fitzroy",cat:"takeaway",amount:38.00},
    {date:"2026-02-19",desc:"🚘 EastLink toll",cat:"toll",amount:18.40},
    {date:"2026-02-20",desc:"🛒 Aldi Coburg North",cat:"grocery",amount:92.80},
    {date:"2026-02-21",desc:"☕ Dukes Coffee Roasters",cat:"restaurant",amount:9.40},
    {date:"2026-02-22",desc:"📦 Amazon AU",cat:"amazon",amount:84.90},
    {date:"2026-02-23",desc:"🛒 Woolworths Brunswick",cat:"grocery",amount:88.60},
    {date:"2026-02-24",desc:"🎭 Melbourne Comedy Festival",cat:"restaurant",amount:68.00},
    {date:"2026-02-25",desc:"💊 Chemist Warehouse Coburg",cat:"health",amount:52.40},
    {date:"2026-02-26",desc:"⛽ Shell Sydney Rd",cat:"transport",amount:82.00},
    {date:"2026-02-27",desc:"🛒 Coles Brunswick",cat:"grocery",amount:76.40},
    {date:"2026-02-28",desc:"☕ Aunty Peg's Coffee",cat:"restaurant",amount:8.80},
  ],
  dailyTotals: {
    "2025-09-01":94.30,"2025-09-02":8.50,"2025-09-03":50.00,"2025-09-04":82.00,
    "2025-09-05":105.00,"2025-09-06":112.40,"2025-09-07":18.50,"2025-09-08":155.00,
    "2025-09-09":9.20,"2025-09-10":34.60,"2025-09-11":82.40,"2025-09-12":34.98,
    "2025-09-13":78.20,"2025-09-14":65.00,"2025-09-15":52.30,"2025-09-16":25.00,
    "2025-09-17":7.80,"2025-09-18":67.80,"2025-09-19":156.40,"2025-09-20":48.50,
    "2025-09-21":74.20,"2025-09-22":14.99,"2025-09-23":88.60,"2025-09-24":9.50,
    "2025-09-25":62.40,"2025-09-26":14.30,"2025-09-27":71.50,"2025-09-28":28.00,
    "2025-09-29":4.49,"2025-09-30":52.00,
    "2025-10-01":8.50,"2025-10-02":98.20,"2025-10-03":285.00,"2025-10-04":88.60,
    "2025-10-05":124.00,"2025-10-06":102.30,"2025-10-07":9.80,"2025-10-08":30.00,
    "2025-10-09":89.95,"2025-10-10":84.70,"2025-10-11":22.40,"2025-10-12":89.99,
    "2025-10-13":64.40,"2025-10-14":8.20,"2025-10-15":32.00,"2025-10-16":76.80,
    "2025-10-17":78.50,"2025-10-18":76.30,"2025-10-19":68.00,"2025-10-20":9.20,
    "2025-10-21":95.60,"2025-10-22":99.90,"2025-10-23":16.80,"2025-10-24":82.40,
    "2025-10-25":38.50,"2025-10-26":8.80,"2025-10-27":42.80,"2025-10-28":30.00,
    "2025-10-29":72.10,"2025-10-30":98.00,
    "2025-11-01":91.20,"2025-11-02":8.90,"2025-11-03":285.00,"2025-11-04":145.00,
    "2025-11-05":84.20,"2025-11-06":108.40,"2025-11-07":19.60,"2025-11-08":234.80,
    "2025-11-09":9.40,"2025-11-10":94.00,"2025-11-11":68.20,"2025-11-12":79.60,
    "2025-11-13":189.00,"2025-11-14":84.60,"2025-11-15":50.00,"2025-11-16":8.20,
    "2025-11-17":98.80,"2025-11-18":112.50,"2025-11-19":24.50,"2025-11-20":18.40,
    "2025-11-21":76.40,"2025-11-22":9.00,"2025-11-23":116.00,"2025-11-24":72.00,
    "2025-11-25":88.00,"2025-11-26":79.30,"2025-11-27":185.00,"2025-11-28":64.20,
    "2025-11-29":21.80,"2025-11-30":94.50,
    "2025-12-01":104.60,"2025-12-02":9.80,"2025-12-03":285.00,"2025-12-04":168.40,
    "2025-12-05":91.20,"2025-12-06":118.60,"2025-12-07":24.20,"2025-12-08":10.50,
    "2025-12-09":320.00,"2025-12-10":89.40,"2025-12-11":156.80,"2025-12-12":112.30,
    "2025-12-13":86.40,"2025-12-14":245.00,"2025-12-15":50.00,"2025-12-16":10.20,
    "2025-12-17":184.20,"2025-12-18":192.50,"2025-12-19":44.00,"2025-12-20":142.80,
    "2025-12-21":280.00,"2025-12-22":68.40,"2025-12-23":196.40,"2025-12-24":223.00,
    "2025-12-25":58.30,"2025-12-26":124.60,"2025-12-27":26.80,"2025-12-28":9.40,
    "2025-12-29":88.00,"2025-12-30":78.40,"2025-12-31":86.40,
    "2026-01-02":8.80,"2026-01-03":94.60,"2026-01-04":285.00,"2026-01-05":82.40,
    "2026-01-06":50.00,"2026-01-07":88.20,"2026-01-08":9.00,"2026-01-09":104.00,
    "2026-01-10":119.90,"2026-01-11":72.40,"2026-01-12":18.20,"2026-01-13":56.80,
    "2026-01-14":76.00,"2026-01-15":8.50,"2026-01-16":88.40,"2026-01-17":36.50,
    "2026-01-18":54.80,"2026-01-19":14.60,"2026-01-20":76.80,"2026-01-21":8.20,
    "2026-01-22":68.60,"2026-01-23":52.00,"2026-01-24":84.20,"2026-01-25":82.40,
    "2026-01-26":78.00,"2026-01-27":91.20,"2026-01-28":16.40,"2026-01-29":9.20,
    "2026-01-30":74.40,
    "2026-02-01":96.40,"2026-02-02":8.80,"2026-02-03":285.00,"2026-02-04":86.40,
    "2026-02-05":50.00,"2026-02-06":104.60,"2026-02-07":20.80,"2026-02-08":9.20,
    "2026-02-09":285.00,"2026-02-10":68.40,"2026-02-11":78.80,"2026-02-12":96.00,
    "2026-02-13":82.40,"2026-02-14":92.00,"2026-02-15":8.60,"2026-02-16":78.20,
    "2026-02-17":46.80,"2026-02-18":38.00,"2026-02-19":18.40,"2026-02-20":92.80,
    "2026-02-21":9.40,"2026-02-22":84.90,"2026-02-23":88.60,"2026-02-24":68.00,
    "2026-02-25":52.40,"2026-02-26":82.00,"2026-02-27":76.40,"2026-02-28":8.80,
  },
};

// ─── SHARED ──────────────────────────────────────────────────────────────────
const fmt=v=>`$${Math.abs(v).toLocaleString()}`;
const fmtK=v=>{const a=Math.abs(v);return(a>=1000?`${v<0?"-":""}$${(a/1000).toFixed(a>=10000?0:1)}k`:`$${v}`);};
const Tip=({active,payload,label})=>{if(!active||!payload)return null;return(<div style={{background:"#111127",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 14px"}}><div style={{color:"#94a3b8",marginBottom:5,fontWeight:600,fontSize:12,textTransform:"uppercase"}}>{label}</div>{payload.filter(p=>p.value!==0&&p.value!==null).map((p,i)=>(<div key={i} style={{color:p.color||"#e2e8f0",display:"flex",justifyContent:"space-between",gap:20,lineHeight:1.7,fontSize:13}}><span>{p.name}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{typeof p.value==='number'&&Math.abs(p.value)>=1000?`$${Math.abs(p.value).toLocaleString()}`:fmt(p.value)}</span></div>))}</div>);};
const St=({label,value,sub,accent="#60a5fa",small})=>(<div style={{background:"linear-gradient(145deg,rgba(255,255,255,0.035) 0%,rgba(255,255,255,0.008) 100%)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:small?"11px 13px":"14px 18px",flex:1,minWidth:small?85:115}}><div style={{color:"#64748b",fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:4}}>{label}</div><div style={{color:accent,fontSize:small?15:20,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.1}}>{value}</div>{sub&&<div style={{color:"#475569",fontSize:11,marginTop:3}}>{sub}</div>}</div>);
const Sec=({children,icon})=>(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,marginTop:24}}><span style={{fontSize:15}}>{icon}</span><h2 style={{margin:0,fontSize:14,fontWeight:700,color:"#e2e8f0"}}>{children}</h2><div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(255,255,255,0.07),transparent)"}}/></div>);
const Ch=({children,height})=>(<div style={{background:"rgba(255,255,255,0.015)",borderRadius:14,border:"1px solid rgba(255,255,255,0.045)",padding:"12px 6px 6px"}}><ResponsiveContainer width="100%" height={height||200}>{children}</ResponsiveContainer></div>);
const Lg=({items})=>(<div style={{display:"flex",justifyContent:"center",gap:11,padding:"5px 0",fontSize:11,flexWrap:"wrap"}}>{items.map(([l,c])=>(<div key={l} style={{display:"flex",alignItems:"center",gap:3,color:"#94a3b8"}}><div style={{width:5,height:5,borderRadius:2,background:c}}/>{l}</div>))}</div>);
const Note=({color,children})=>(<div style={{marginTop:7,padding:9,borderRadius:8,background:`${color}08`,border:`1px solid ${color}15`,fontSize:12,color:"#94a3b8",lineHeight:1.5}}>{children}</div>);
const ProBadge=({title,description,cta})=>(<div style={{padding:'16px 20px',borderRadius:14,background:'linear-gradient(145deg, rgba(79,110,247,0.08) 0%, rgba(124,58,237,0.04) 100%)',border:'1px solid rgba(79,110,247,0.15)',marginTop:8,marginBottom:8}}><div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}><span style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.1em',color:'#7c3aed',background:'rgba(124,58,237,0.12)',padding:'2px 8px',borderRadius:4}}>Pro</span><span style={{fontSize:12,fontWeight:600,color:'#e2e8f0'}}>{title}</span></div>{description&&<div style={{fontSize:11,color:'#94a3b8',lineHeight:1.5,marginBottom:cta?10:0}}>{description}</div>}{cta&&<button onClick={cta.onClick} style={{fontSize:11,fontWeight:600,color:'#4f6ef7',background:'none',border:'none',cursor:'pointer',padding:0,fontFamily:'inherit'}}>{cta.label} →</button>}</div>);
const Row=({label,value,color,bold,note,borderTop})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:bold?"8px 0":"4px 0",borderTop:borderTop?"1px solid rgba(255,255,255,0.06)":"none",marginTop:borderTop?4:0}}><span style={{fontSize:13,color:bold?"#e2e8f0":"#94a3b8",fontWeight:bold?700:400}}>{label}{note&&<span style={{fontSize:10,color:"#475569",marginLeft:6}}>{note}</span>}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:bold?15:13,fontWeight:bold?700:600,color:color||"#cbd5e1"}}>{value}</span></div>);
const Badge=({text,color})=>(<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:`${color}15`,color,whiteSpace:"nowrap"}}>{text}</span>);

const CAT_COLORS={grocery:'#34d399',restaurant:'#fb923c',takeaway:'#f97316',coffee:'#a78bfa',delivery:'#60a5fa',transport:'#38bdf8',fuel:'#facc15',toll:'#94a3b8',utilities:'#a8a29e',telco:'#6ee7b7',insurance:'#93c5fd',sub:'#c084fc',health:'#f472b6',fitness:'#86efac',home:'#fde68a',clothing:'#fca5a5',education:'#67e8f9',pets:'#bbf7d0',travel:'#7dd3fc',gambling:'#fb7185',government:'#94a3b8',income:'#34d399',transfer:'#64748b',mortgage:'#94a3b8',rent:'#94a3b8',amazon:'#f97316',paypal:'#3b82f6',shopping:'#e879f9',other:'#475569'};
const ALL_CATS=['grocery','restaurant','takeaway','coffee','delivery','transport','fuel','toll','utilities','telco','insurance','sub','health','fitness','home','clothing','education','pets','travel','gambling','government','income','transfer','mortgage','rent','other'];


const Card=({label,value,type,detail})=>(<div style={{padding:"9px 11px",borderRadius:10,background:type==="in"?"rgba(52,211,153,0.04)":"rgba(248,113,113,0.04)",border:`1px solid ${type==="in"?"rgba(52,211,153,0.08)":"rgba(248,113,113,0.08)"}`}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:600,color:"#cbd5e1"}}>{label}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:13,color:type==="in"?"#34d399":"#f87171"}}>{type==="in"?"+":"−"}{value}</span></div><div style={{fontSize:10,color:"#475569",marginTop:2}}>{detail}</div></div>);
const xP={tick:{fill:"#64748b",fontSize:11},axisLine:{stroke:"rgba(255,255,255,0.05)"}};
const yP={tickFormatter:fmtK,tick:{fill:"#64748b",fontSize:10},axisLine:false,tickLine:false};
const gd=<CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)"/>;

// ─── ALL DATA (sourced from DEMO_DATA) ───────────────────────────────────────
const pnlHC      = DEMO_DATA.pnl;
const cdHC       = DEMO_DATA.cd;
const amzHC      = DEMO_DATA.amz;
const foodHC     = DEMO_DATA.food;
const hmHC       = DEMO_DATA.hm;
const hcatsHC    = DEMO_DATA.hcats;
const tolls      = DEMO_DATA.tolls;
const glob       = DEMO_DATA.glob;
const cc         = DEMO_DATA.cc;
const sm         = DEMO_DATA.sm;
const sa         = DEMO_DATA.sa;
const ppCatsHC   = DEMO_DATA.ppCats;
const ppMHC      = DEMO_DATA.ppM;
const sdr        = DEMO_DATA.sdr;
const saf        = DEMO_DATA.saf;
const mortBalHC  = DEMO_DATA.mortBal;
const sharesHC   = DEMO_DATA.shares;
const topupPayoff= DEMO_DATA.topupPayoff;
const dowHC      = DEMO_DATA.dow;
const bvaHC      = DEMO_DATA.bva;
const upcoming   = DEMO_DATA.upcoming;
const hoursData  = DEMO_DATA.hoursData;
const compound   = DEMO_DATA.compound;
const scorecard  = DEMO_DATA.scorecard;
const velocity   = DEMO_DATA.velocity;

const P = DEMO_DATA.profile;
const S = P.householdNetMonthly;          // 10,760 combined avg take-home
const TC_BASE = P.committedTotal;          // 6,455 total committed
const CORE = S + P.medicareRebateMonthly;
const DISC = CORE - TC_BASE - P.overviewHealthMonthly - P.overviewTransportMonthly;

// Net worth snapshot (derived from DEMO_DATA)
const NW_ASSETS = P.propertyValue + P.vehicleValue + P.sharesPortfolioValue;
const NW_DEBT   = P.mainMortgage + P.topupLoan;
const NW_NOW    = NW_ASSETS - NW_DEBT;

const tabGroups=[
  {label:"Summary",  tabs:[{id:"overview",l:"📊 Overview"},{id:"planner",l:"🎛️ Planner"}]},
  {label:"Assets",   tabs:[{id:"networth",l:"💰 Net Worth"},{id:"property",l:"🏠 Property"}]},
  {label:"Spending", tabs:[{id:"committed",l:"📌 Committed"},{id:"health",l:"💊 Health"},{id:"variable",l:"🛒 Variable"},{id:"paypal",l:"💳 PayPal"},{id:"savings",l:"🏦 Savings"}]},
  {label:"Insights", tabs:[{id:"insights",l:"💡 Insights"},{id:"deep",l:"🔬 Deep Dive"},{id:"trend",l:"📉 Trend"},{id:"subs",l:"📱 Subs"},{id:"heatmap",l:"📅 Heatmap"},{id:"search",l:"🔍 Search"}]},
  {label:"Planning", tabs:[{id:"goals",l:"🎯 Goals"},{id:"tax",l:"💸 Tax"},{id:"compare",l:"⚖️ Compare"},{id:"growth",l:"🌱 Growth"}]},
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

// ─── CSV UPLOAD HELPER ────────────────────────────────────────────────────────
function colMapStorageKey(headers) {
  const sorted = [...headers].sort().join('|');
  let h = 0;
  for (let i = 0; i < sorted.length; i++) h = Math.imul(31, h) + sorted.charCodeAt(i) | 0;
  return `comma_colmap_${(h >>> 0).toString(36)}`;
}

function buildFormatFromSaved(saved) {
  return {
    bank: 'unknown', bankLabel: 'Unknown Bank', confidence: 'mapped',
    columns: {
      date: saved.dateCol, description: saved.descCol,
      amount: saved.amtStyle === 'single' ? saved.amountCol : null,
      debit: saved.amtStyle === 'split' ? saved.debitCol : null,
      credit: saved.amtStyle === 'split' ? saved.creditCol : null,
      balance: saved.balanceCol || null, category: null,
    },
    amountStyle: saved.amtStyle,
  };
}

function processUploadedFile(filename, rawCsvText) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const result = processCSVText(rawCsvText);
    if (result.error) {
      return { id, filename, rawCsvText, type: 'error', bankLabel: filename, status: 'error', rowCount: 0, dateRange: null, parsedData: null };
    }
    if (result.type === 'manual') {
      // Auto-apply saved column mapping if one exists for these headers
      const headers = result.rows.length > 0 ? Object.keys(result.rows[0]) : [];
      try {
        const saved = JSON.parse(localStorage.getItem(colMapStorageKey(headers)) || 'null');
        if (saved) {
          const data = processUniversalBank(result.rows, buildFormatFromSaved(saved));
          if (data) return { id, filename, rawCsvText, type: 'bank', bankLabel: 'Unknown Bank', status: 'success', rowCount: data.rowCount || 0, dateRange: data.dateRange || null, parsedData: data };
        }
      } catch {}
      return { id, filename, rawCsvText, type: 'manual', bankLabel: result.format?.bankLabel || 'Unknown Bank', status: 'manual', rowCount: result.rows?.length || 0, dateRange: null, parsedData: null };
    }
    if (!result.data) {
      return { id, filename, rawCsvText, type: 'error', bankLabel: result.format?.bankLabel || filename, status: 'error', rowCount: 0, dateRange: null, parsedData: null };
    }
    const bankLabel = result.format?.bankLabel || (result.type === 'commsec' ? 'CommSec' : result.type === 'paypal' ? 'PayPal' : 'Bank');
    const rowCount  = result.data.rowCount || 0;
    const dateRange = result.data.dateRange || null;
    return { id, filename, rawCsvText, type: result.type, bankLabel, status: 'success', rowCount, dateRange, parsedData: result.data };
  } catch {
    return { id, filename, rawCsvText, type: 'error', bankLabel: filename, status: 'error', rowCount: 0, dateRange: null, parsedData: null };
  }
}

// ─── COLUMN MAPPING MODAL ────────────────────────────────────────────────────
function ColumnMappingModal({ file, onClose, onSuccess }) {
  const rows = useMemo(() => parseCSV(file.rawCsvText), [file.rawCsvText]);
  const headers = useMemo(() => rows.length > 0 ? Object.keys(rows[0]) : [], [rows]);
  const storageKey = useMemo(() => colMapStorageKey(headers), [headers]);

  const saved = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; }
  }, [storageKey]);

  const [dateCol,    setDateCol]    = useState(saved?.dateCol    || '');
  const [descCol,    setDescCol]    = useState(saved?.descCol    || '');
  const [amtStyle,   setAmtStyle]   = useState(saved?.amtStyle   || 'single');
  const [amountCol,  setAmountCol]  = useState(saved?.amountCol  || '');
  const [debitCol,   setDebitCol]   = useState(saved?.debitCol   || '');
  const [creditCol,  setCreditCol]  = useState(saved?.creditCol  || '');
  const [balanceCol, setBalanceCol] = useState(saved?.balanceCol || '');
  const [error,      setError]      = useState('');

  const ColSelect = ({ value, onChange }) => (
    <select
      value={value}
      onChange={e => { setError(''); onChange(e.target.value); }}
      style={{
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6, color: value ? '#e2e8f0' : '#475569', fontSize: 12,
        padding: '6px 8px', fontFamily: 'inherit', cursor: 'pointer', width: '100%', outline: 'none',
      }}
    >
      <option value="">— select column —</option>
      {headers.map(h => <option key={h} value={h}>{h}</option>)}
    </select>
  );

  const handleParse = () => {
    if (!dateCol) { setError('Date column is required'); return; }
    if (!descCol) { setError('Description column is required'); return; }
    if (amtStyle === 'single' && !amountCol) { setError('Amount column is required'); return; }
    if (amtStyle === 'split' && (!debitCol || !creditCol)) { setError('Both Debit and Credit columns are required'); return; }

    const format = {
      bank: 'unknown', bankLabel: 'Unknown Bank', confidence: 'mapped',
      columns: {
        date: dateCol, description: descCol,
        amount: amtStyle === 'single' ? amountCol : null,
        debit: amtStyle === 'split' ? debitCol : null,
        credit: amtStyle === 'split' ? creditCol : null,
        balance: balanceCol || null, category: null,
      },
      amountStyle: amtStyle,
    };

    const data = processUniversalBank(rows, format);
    if (!data) { setError('No transactions found with this mapping. Try different column selections.'); return; }

    localStorage.setItem(storageKey, JSON.stringify({ dateCol, descCol, amtStyle, amountCol, debitCol, creditCol, balanceCol }));
    onSuccess(data);
  };

  const labelStyle = { fontSize: 11, color: '#94a3b8', display: 'block' };
  const req = <span style={{ color: '#f87171' }}>*</span>;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>Map Columns</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{file.filename} · {rows.length} rows</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>

        {/* CSV preview */}
        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                {headers.map(h => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 3).map((row, i) => (
                <tr key={i}>
                  {headers.map(h => (
                    <td key={h} style={{ padding: '6px 10px', color: '#64748b', whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>{row[h]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Amount style toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[['single', 'Single amount column'], ['split', 'Separate debit / credit']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => { setAmtStyle(v); setError(''); }}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
                border: `1px solid ${amtStyle === v ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.07)'}`,
                background: amtStyle === v ? 'rgba(96,165,250,0.1)' : 'transparent',
                color: amtStyle === v ? '#93c5fd' : '#64748b',
              }}
            >{l}</button>
          ))}
        </div>

        {/* Column selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <label style={labelStyle}>Date {req}<div style={{ marginTop: 4 }}><ColSelect value={dateCol} onChange={setDateCol} /></div></label>
          <label style={labelStyle}>Description {req}<div style={{ marginTop: 4 }}><ColSelect value={descCol} onChange={setDescCol} /></div></label>
          {amtStyle === 'single' ? (
            <label style={labelStyle}>Amount {req}<div style={{ marginTop: 4 }}><ColSelect value={amountCol} onChange={setAmountCol} /></div></label>
          ) : (
            <>
              <label style={labelStyle}>Debit (money out) {req}<div style={{ marginTop: 4 }}><ColSelect value={debitCol} onChange={setDebitCol} /></div></label>
              <label style={labelStyle}>Credit (money in) {req}<div style={{ marginTop: 4 }}><ColSelect value={creditCol} onChange={setCreditCol} /></div></label>
            </>
          )}
          <label style={labelStyle}>Balance <span style={{ color: '#475569', fontSize: 10 }}>(optional)</span><div style={{ marginTop: 4 }}><ColSelect value={balanceCol} onChange={setBalanceCol} /></div></label>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        <button
          onClick={handleParse}
          style={{ width: '100%', padding: '12px 0', borderRadius: 10, background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)', color: '#93c5fd', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >Parse transactions</button>
      </div>
    </div>
  );
}

// ─── WELCOME SCREEN ───────────────────────────────────────────────────────────
function WelcomeScreen({ onLaunchDemo, onUploadFiles }) {
  const [dropActive, setDropActive] = useState(false);
  const welcomeFileRef = useRef(null);

  return (
    <div style={{
      fontFamily: "'Instrument Sans', -apple-system, sans-serif",
      background: "#0b0b17",
      color: "#e2e8f0",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Logo */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 52 }}>
        <div style={{
          width: 60, height: 60,
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          borderRadius: 18,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 34, fontWeight: 700, color: "#fff",
          marginBottom: 18,
          boxShadow: "0 8px 32px rgba(99,102,241,0.35)",
          lineHeight: 1,
          paddingTop: 6,
          userSelect: "none",
        }}>
          ,
        </div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.02em" }}>Comma</h1>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: "#475569", textAlign: "center", maxWidth: 340, lineHeight: 1.65 }}>
          Your personal finance dashboard — built for Australian households
        </p>
      </div>

      {/* Two cards */}
      <div style={{
        display: "flex",
        gap: 16,
        width: "100%",
        maxWidth: 740,
        flexWrap: "wrap",
        justifyContent: "center",
        marginBottom: 36,
      }}>

        {/* Card A — Demo */}
        <div style={{
          flex: "1 1 290px",
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20,
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <div style={{ fontSize: 30 }}>📊</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>Explore with demo data</div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>
            See what Comma can do with realistic Australian financial data
          </div>
          <div style={{ flex: 1, minHeight: 16 }} />
          <button
            onClick={onLaunchDemo}
            style={{
              marginTop: 4,
              padding: "12px 28px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(99,102,241,0.28)",
              transition: "opacity 0.15s",
            }}
            onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}
          >
            Launch Demo
          </button>
        </div>

        {/* Card B — Upload */}
        <div style={{
          flex: "1 1 290px",
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 20,
          padding: "32px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 10,
        }}>
          <div style={{ fontSize: 30 }}>🏦</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>Upload your bank CSV</div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>
            Drag in your bank export and see your own finances in seconds
          </div>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDropActive(true); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropActive(false); }}
            onDrop={e => { e.preventDefault(); setDropActive(false); if (e.dataTransfer.files.length) onUploadFiles(e.dataTransfer.files); }}
            onClick={() => welcomeFileRef.current?.click()}
            style={{
              width: "100%",
              border: `1.5px dashed ${dropActive ? 'rgba(99,102,241,0.6)' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 12,
              padding: "22px 16px",
              textAlign: "center",
              cursor: "pointer",
              background: dropActive ? "rgba(99,102,241,0.06)" : "rgba(255,255,255,0.015)",
              transition: "border-color 0.2s, background 0.2s",
              boxSizing: "border-box",
              marginTop: 4,
            }}
          >
            <input
              ref={welcomeFileRef}
              type="file"
              accept=".csv"
              multiple
              style={{ display: "none" }}
              onChange={e => { if (e.target.files.length) onUploadFiles(e.target.files); e.target.value = ''; }}
            />
            <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.3 }}>⬆</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>Drop CSV here</div>
            <div style={{ fontSize: 11, color: "#475569" }}>or click to browse · auto-detects format</div>
          </div>
        </div>

      </div>

      {/* Bank compatibility */}
      <div style={{ fontSize: 12, color: "#2d3748", textAlign: "center" }}>
        Works with CBA, NAB, ANZ, Westpac, Up Bank, Macquarie, and more
      </div>
    </div>
  );
}

function DashboardInner() {
  const [tab, setTab] = useState("planner");
  const tC = cc.reduce((s, c) => s + c.a, 0);
  const tSM = sm.reduce((s, c) => s + c.c, 0);

  // ─── PLANNER STATE ───────────────────────────────────────────────────────
  const [salary, setSalary] = useState(P.plannerSalaryMin);
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
  const [propertyValue, setPropertyValue] = useState(P.propertyValue);
  const [sharesValue, setSharesValue] = useState(P.sharesPortfolioValue);
  const [sharesMonthly, setSharesMonthly] = useState(0);

  // ─── TAX STATE ───────────────────────────────────────────────────────────
  const [grossSalary, setGrossSalary] = useState(P.alexSalaryGross);

  // ─── SCENARIO B STATE ────────────────────────────────────────────────────
  const [bSalary, setBSalary] = useState(P.plannerSalaryTarget);
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

  // ─── UPLOAD STATE ─────────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [dropActive,    setDropActive]    = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('comma_uploaded_data') || '[]');
      return stored.map(item => processUploadedFile(item.filename, item.rawCsvText));
    } catch { return []; }
  });
  const [isMobile,       setIsMobile]       = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchCat,      setSearchCat]      = useState('all');
  const [openCatPicker,  setOpenCatPicker]  = useState(null);  // tx key (date+desc) or null
  const [catConfirm,     setCatConfirm]     = useState(null);  // {pattern, cat, count, isFirst} or null
  const [pendingRule,    setPendingRule]    = useState(null);  // {txKey, tx, cat, editPattern} or null
  const [mappingFileId,  setMappingFileId]  = useState(null);
  const [showCatHint,    setShowCatHint]    = useState(() => {
    try { return !localStorage.getItem('comma_categorise_hint_dismissed'); } catch { return true; }
  });
  const [firstRecatDone, setFirstRecatDone] = useState(() => {
    try { return !!localStorage.getItem('comma_first_recat_done'); } catch { return false; }
  });
  const [showWelcome,    setShowWelcome]    = useState(() => {
    try {
      if (localStorage.getItem('comma_onboarded')) return false;
      const stored = JSON.parse(localStorage.getItem('comma_uploaded_data') || '[]');
      return stored.length === 0;
    } catch { return true; }
  });

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Persist raw CSV texts to localStorage whenever uploadedFiles changes
  useEffect(() => {
    const toStore = uploadedFiles.map(({ id, filename, rawCsvText, type, bankLabel, status, rowCount }) =>
      ({ id, filename, rawCsvText, type, bankLabel, status, rowCount })
    );
    localStorage.setItem('comma_uploaded_data', JSON.stringify(toStore));
  }, [uploadedFiles]);

  // ─── GOALS STATE ──────────────────────────────────────────────────────────
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('comma_goals') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem('comma_goals', JSON.stringify(goals));
  }, [goals]);

  const addGoal    = (goal)          => setGoals(prev => [...prev, goal]);
  const updateGoal = (id, updates)   => setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  const deleteGoal = (id)            => setGoals(prev => prev.filter(g => g.id !== id));

  // ─── BALANCE SHEET STATE ─────────────────────────────────────────────────
  const BS_DEFAULT_ASSETS = [{ id:'property',name:'Property',value:0,icon:'🏠' },{ id:'savings',name:'Savings',value:0,icon:'💰' },{ id:'shares',name:'Shares',value:0,icon:'📈' },{ id:'super',name:'Superannuation',value:0,icon:'🏦' },{ id:'vehicle',name:'Vehicle',value:0,icon:'🚗' }];
  const BS_DEFAULT_LIABS  = [{ id:'mortgage',name:'Mortgage',value:0,icon:'🏠' },{ id:'car_loan',name:'Car Loan',value:0,icon:'🚗' },{ id:'credit_card',name:'Credit Card',value:0,icon:'💳' },{ id:'hecs',name:'HECS-HELP',value:0,icon:'🎓' }];
  const [bsAssets, setBsAssets] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('comma_balance_sheet') || 'null'); return s?.assets ?? BS_DEFAULT_ASSETS; }
    catch { return BS_DEFAULT_ASSETS; }
  });
  const [bsLiabilities, setBsLiabilities] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('comma_balance_sheet') || 'null'); return s?.liabilities ?? BS_DEFAULT_LIABS; }
    catch { return BS_DEFAULT_LIABS; }
  });
  useEffect(() => {
    localStorage.setItem('comma_balance_sheet', JSON.stringify({ assets: bsAssets, liabilities: bsLiabilities }));
  }, [bsAssets, bsLiabilities]);
  const [editingBsCell,    setEditingBsCell]    = useState(null); // { type:'asset'|'liability', id }
  const [editingBsValue,   setEditingBsValue]   = useState('');
  const [bsHoveredId,      setBsHoveredId]      = useState(null); // { type, id }
  const [showAddAsset,     setShowAddAsset]     = useState(false);
  const [showAddLiability, setShowAddLiability] = useState(false);
  const [newBsDraft,       setNewBsDraft]       = useState({ icon:'💰', name:'', value:'' });

  // ─── NET WORTH SNAPSHOTS ──────────────────────────────────────────────────
  const [nwSnapshots, setNwSnapshots] = useState(() => {
    try { return JSON.parse(localStorage.getItem('comma_nw_snapshots') || '[]'); }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem('comma_nw_snapshots', JSON.stringify(nwSnapshots));
  }, [nwSnapshots]);
  const [nwSnapshotMsg,        setNwSnapshotMsg]        = useState(null); // confirmation string
  const [nwSnapshotConfirm,    setNwSnapshotConfirm]    = useState(false); // pending replace?
  const [nwSelSnap,            setNwSelSnap]            = useState(null);  // clicked snapshot for breakdown
  const [nwExpandedSnaps,      setNwExpandedSnaps]      = useState(() => new Set());
  const [nwDeleteConfirm,      setNwDeleteConfirm]      = useState(null);  // snap id pending delete

  // ─── TIER STATE (wired to auth in Session 8) ──────────────────────────────
  const [userTier, setUserTier] = useState('free'); // 'free' | 'pro' | 'lifetime'

  // ─── USER RULES STATE ─────────────────────────────────────────────────────
  const [userRules, setUserRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem('comma_user_rules') || '{}'); }
    catch { return {}; }
  });

  useEffect(() => {
    localStorage.setItem('comma_user_rules', JSON.stringify(userRules));
  }, [userRules]);

  useEffect(() => {
    if (!catConfirm) return;
    const t = setTimeout(() => setCatConfirm(null), 4000);
    return () => clearTimeout(t);
  }, [catConfirm]);

  const addUserRule    = (pattern, category) => setUserRules(prev => ({ ...prev, [pattern]: category }));
  const deleteUserRule = (pattern)            => setUserRules(prev => { const n = { ...prev }; delete n[pattern]; return n; });
  const getUserRules   = ()                   => userRules;

  const [showImportRules, setShowImportRules] = useState(false);
  const [importRulesText, setImportRulesText] = useState('');
  const [importRulesStatus, setImportRulesStatus] = useState(null); // {ok:bool, msg:string}
  const [hoverDay, setHoverDay] = useState(null); // heatmap hover state

  // ── AI Insights config ──
  const AI_PROVIDERS = {
    anthropic: { label: 'Anthropic', sub: 'Claude', accent: '#d4a27f', placeholder: 'sk-ant-…', models: [{ id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' }, { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }] },
    openai:    { label: 'OpenAI',    sub: 'ChatGPT', accent: '#10a37f', placeholder: 'sk-…',    models: [{ id: 'gpt-4o', label: 'GPT-4o' }, { id: 'gpt-4o-mini', label: 'GPT-4o mini' }] },
    google:    { label: 'Google',    sub: 'Gemini',  accent: '#4285f4', placeholder: 'AI…',     models: [{ id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }, { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }] },
  };
  const [aiConfig, setAiConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('comma_ai_config') || '{}'); } catch { return {}; }
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiTestStatus, setAiTestStatus] = useState(null); // {ok:bool, msg:string} | null
  const [aiTesting, setAiTesting] = useState(false);

  const aiProvider = aiConfig.provider || 'anthropic';
  const aiModel    = aiConfig.model || AI_PROVIDERS[aiProvider].models[0].id;
  const aiKey      = aiConfig.apiKey || '';

  function saveAiConfig(patch) {
    setAiConfig(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem('comma_ai_config', JSON.stringify(next));
      return next;
    });
    setAiTestStatus(null);
  }

  // ── AI Chat overlay state ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatHasUnread, setChatHasUnread] = useState(false);
  const [fabPulsed, setFabPulsed] = useState(false);
  // ── AI Chat state ──
  const [chatMessages, setChatMessages] = useState([]); // [{role:'user'|'assistant', text:string}]
  const [chatInput, setChatInput] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatSuggestions, setChatSuggestions] = useState([]);
  const chatBottomRef = useRef(null);
  const chatInputRef = useRef(null);
  const chatQueueRef = useRef([]);

  // Follow-up suggestion rules — keyword match on last assistant response
  const CHAT_FOLLOWUP_RULES = [
    { keywords: ['uncat'], suggestions: ['Help me categorise them', 'Which uncategorised transactions are largest?'] },
    { keywords: ['saving', 'savings rate', 'save more', 'surplus'], suggestions: ["What's my projected savings in 6 months?", 'How do I reach my savings goal faster?', 'Where can I cut spending to save more?'] },
    { keywords: ['spend', 'spending', 'expense', 'cost', 'paid'], suggestions: ['Show me a breakdown by category', 'Compare to last month', 'What are my biggest discretionary expenses?'] },
    { keywords: ['grocery', 'groceries', 'supermarket', 'coles', 'woolworths'], suggestions: ['How does my grocery spend compare to average?', 'Show me my grocery trend over time'] },
    { keywords: ['dining', 'restaurant', 'takeaway', 'food', 'eating out', 'coffee'], suggestions: ['How much do I spend on dining per month?', 'Compare dining vs groceries'] },
    { keywords: ['subscription', 'streaming', 'netflix', 'spotify', 'recurring'], suggestions: ['List all my subscriptions', 'Which subscriptions can I cancel?'] },
    { keywords: ['mortgage', 'loan', 'debt', 'interest', 'property'], suggestions: ['How much interest am I paying?', 'What is my loan-to-value ratio?'] },
    { keywords: ['income', 'salary', 'earn', 'pay'], suggestions: ['How does my income vary month to month?', 'What is my effective hourly rate?'] },
    { keywords: ['invest', 'shares', 'portfolio', 'stock', 'super'], suggestions: ['What is my total net worth?', 'How are my investments performing?'] },
  ];

  // Category keyword → tab navigation
  const CHAT_CATEGORY_LINKS = [
    { pattern: /\b(grocer(?:y|ies)|supermarket|coles|woolworths)\b/gi, tab: 'variable', label: null },
    { pattern: /\b(dining|restaurant(?:s)?|takeaway|eating out)\b/gi, tab: 'variable', label: null },
    { pattern: /\b(variable spending|discretionary spending)\b/gi, tab: 'variable', label: null },
    { pattern: /\b(health|medical|pharmacy|GP|physio|dental)\b/gi, tab: 'health', label: null },
    { pattern: /\b(subscription(?:s)?|streaming|netflix|spotify)\b/gi, tab: 'subs', label: null },
    { pattern: /\b(PayPal)\b/gi, tab: 'paypal', label: null },
    { pattern: /\b(spending pattern(?:s)?|category breakdown|categories)\b/gi, tab: 'insights', label: null },
    { pattern: /\b(trend(?:s)?|month[- ]by[- ]month|monthly trend)\b/gi, tab: 'trend', label: null },
  ];

  function getFollowUpSuggestions(text) {
    const lower = text.toLowerCase();
    for (const rule of CHAT_FOLLOWUP_RULES) {
      if (rule.keywords.some(k => lower.includes(k))) {
        return rule.suggestions.slice(0, 3);
      }
    }
    return [];
  }
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);
  // Expose tab navigation for inline category link buttons rendered via dangerouslySetInnerHTML
  useEffect(() => { window.__chatNav = (t) => setTab(t); return () => { delete window.__chatNav; }; }, []);
  // Drain message queue when streaming finishes
  useEffect(() => {
    if (!chatStreaming && chatQueueRef.current.length > 0) {
      const next = chatQueueRef.current.shift();
      sendChatMessage(next); // eslint-disable-line react-hooks/exhaustive-deps
    }
  }, [chatStreaming]); // eslint-disable-line react-hooks/exhaustive-deps
  // Mark unread dot when AI finishes a response and panel is closed
  useEffect(() => {
    if (!chatStreaming && chatMessages.length > 0 && chatMessages[chatMessages.length - 1]?.role === 'assistant' && !chatOpen) {
      setChatHasUnread(true);
    }
  }, [chatStreaming]); // eslint-disable-line react-hooks/exhaustive-deps
  // FAB pulse: fire once on mount, then stop
  useEffect(() => {
    const t = setTimeout(() => setFabPulsed(true), 300);
    return () => clearTimeout(t);
  }, []);

  async function testAiConnection() {
    if (!aiKey) return;
    setAiTesting(true);
    setAiTestStatus(null);
    try {
      let ok = false, label = '';
      if (aiProvider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': aiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: aiModel, max_tokens: 10, messages: [{ role: 'user', content: 'Reply with OK' }] }),
        });
        const j = await res.json();
        ok = res.ok && j?.content?.[0]?.text;
        label = ok ? `Connected to ${AI_PROVIDERS.anthropic.models.find(m => m.id === aiModel)?.label || aiModel}` : (j?.error?.message || 'Invalid API key');
      } else if (aiProvider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${aiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: aiModel, max_tokens: 5, messages: [{ role: 'user', content: 'Reply with OK' }] }),
        });
        const j = await res.json();
        ok = res.ok && j?.choices?.[0]?.message?.content;
        label = ok ? `Connected to ${AI_PROVIDERS.openai.models.find(m => m.id === aiModel)?.label || aiModel}` : (j?.error?.message || 'Invalid API key');
      } else if (aiProvider === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${aiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with OK' }] }] }),
        });
        const j = await res.json();
        ok = res.ok && j?.candidates?.[0]?.content?.parts?.[0]?.text;
        label = ok ? `Connected to ${AI_PROVIDERS.google.models.find(m => m.id === aiModel)?.label || aiModel}` : (j?.error?.message || 'Invalid API key');
      }
      setAiTestStatus({ ok, msg: ok ? `✓ ${label}` : `✗ ${label}` });
    } catch (e) {
      setAiTestStatus({ ok: false, msg: `✗ ${e.message}` });
    } finally {
      setAiTesting(false);
    }
  }

  async function sendChatMessage(inputText) {
    const text = (inputText !== undefined ? inputText : chatInput).trim();
    if (!text || !aiKey) return;

    // Queue if already streaming
    if (chatStreaming) {
      chatQueueRef.current.push(text);
      if (inputText === undefined) setChatInput('');
      return;
    }

    // Always include financial context prepended to the first message in history
    const contextPrefix = buildFinancialContext({ pnl, hcats, goals, netWorth: NW_NOW, uncatCount, isLiveData, bankTxCount });

    const newMessages = [...chatMessages, { role: 'user', text }];
    setChatMessages(newMessages);
    if (inputText === undefined) setChatInput('');
    setChatStreaming(true);
    setChatSuggestions([]);

    const apiMessages = newMessages.map((m, i) => ({
      role: m.role,
      content: i === 0 ? contextPrefix + m.text : m.text,
    }));

    let assistantText = '';

    await streamChat(
      aiProvider, aiKey, aiModel, apiMessages,
      (chunk) => {
        assistantText += chunk;
        setChatMessages([...newMessages, { role: 'assistant', text: assistantText }]);
      },
      () => {
        if (!assistantText) setChatMessages([...newMessages, { role: 'assistant', text: '(No response)' }]);
        setChatStreaming(false);
        setChatSuggestions(assistantText ? getFollowUpSuggestions(assistantText) : []);
      },
      (err) => {
        const msg = err.message || '';
        let errorText, action;
        if (/429|rate.?limit/i.test(msg)) {
          errorText = `Rate limited by ${AI_PROVIDERS[aiProvider]?.label || aiProvider}. Wait a moment and try again.`;
        } else if (/401|403|unauthorized|invalid.*key|api.?key/i.test(msg)) {
          errorText = 'API key invalid or expired. Update it in Settings.';
          action = { label: 'Go to Settings', tab: 'settings' };
        } else {
          errorText = `Error: ${msg}. Check your API key in Settings.`;
          action = { label: 'Go to Settings', tab: 'settings' };
        }
        setChatMessages([...newMessages, { role: 'assistant', text: errorText, isError: true, action }]);
        setChatStreaming(false);
        chatQueueRef.current = [];
      },
    );
  }

  // Re-apply user rules to all bank/upbank files whenever rules change.
  // Always apply to originalRawTxs (pre-rule data) so deleting a rule correctly reverts categories.
  useEffect(() => {
    setUploadedFiles(prev => prev.map(f => {
      if ((f.type !== 'bank' && f.type !== 'upbank') || !f.parsedData?.rawTxs) return f;
      const baseRawTxs = f.originalRawTxs || f.parsedData.rawTxs;
      const recatTxs = applyUserRules(baseRawTxs, userRules);
      return { ...f, originalRawTxs: baseRawTxs, parsedData: aggregateTxs(recatTxs) };
    }));
  }, [userRules]);

  const [showGoalForm,   setShowGoalForm]   = useState(false);
  const [editingGoalId,  setEditingGoalId]  = useState(null);
  const [deletingGoalId, setDeletingGoalId] = useState(null);
  const [goalDraft,      setGoalDraft]      = useState({ emoji:'🎯', name:'', targetAmount:'', targetDate:'', savedSoFar:'0' });

  const handleUploadedFiles = (fileList) => {
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        let record = processUploadedFile(file.name, e.target.result);
        if ((record.type === 'bank' || record.type === 'upbank') && record.parsedData?.rawTxs) {
          const originalRawTxs = record.parsedData.rawTxs;
          if (Object.keys(userRules).length > 0) {
            record = { ...record, originalRawTxs, parsedData: aggregateTxs(applyUserRules(originalRawTxs, userRules)) };
          } else {
            record = { ...record, originalRawTxs };
          }
        }
        setUploadedFiles(prev => [...prev, record]);
      };
      reader.readAsText(file);
    });
  };

  const handleMappingSuccess = (fileId, data) => {
    setUploadedFiles(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      const originalRawTxs = data?.rawTxs;
      let parsedData = data;
      if (originalRawTxs && Object.keys(userRules).length > 0) {
        parsedData = aggregateTxs(applyUserRules(originalRawTxs, userRules));
      }
      return { ...f, status: 'success', type: 'bank', bankLabel: 'Unknown Bank', rowCount: parsedData.rowCount || 0, dateRange: parsedData.dateRange || null, parsedData, originalRawTxs };
    }));
    setMappingFileId(null);
  };

  // ─── LIVE DATA FROM UPLOADS ──────────────────────────────────────────────
  const upData = useMemo(() =>
    uploadedFiles.filter(f => f.type === 'bank' || f.type === 'upbank').at(-1)?.parsedData ?? null,
    [uploadedFiles]
  );
  const ppData = useMemo(() =>
    uploadedFiles.filter(f => f.type === 'paypal').at(-1)?.parsedData ?? null,
    [uploadedFiles]
  );
  const csData = useMemo(() =>
    uploadedFiles.filter(f => f.type === 'commsec').at(-1)?.parsedData ?? null,
    [uploadedFiles]
  );
  const gwData = null; // mortgage tab: demo data only

  // Seed Planner salary slider with live avg income when data first loads
  const salarySeeded = useRef(false);
  useEffect(() => {
    if (upData && !salarySeeded.current && upData.pnl?.length > 0) {
      const avg = Math.round(upData.pnl.reduce((s,r)=>s+r.i,0)/upData.pnl.length);
      if (avg > 0) { setSalary(Math.min(15000, Math.max(P.plannerSalaryMin, avg))); salarySeeded.current = true; }
    }
  }, [upData]);

  const handleLaunchDemo = () => {
    localStorage.setItem('comma_onboarded', 'true');
    setShowWelcome(false);
    setTab('overview');
  };

  const handleWelcomeUpload = (fileList) => {
    Array.from(fileList).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const record = processUploadedFile(file.name, e.target.result);
        setUploadedFiles(prev => [...prev, record]);
        localStorage.setItem('comma_onboarded', 'true');
        setShowWelcome(false);
        setTab('overview');
      };
      reader.readAsText(file);
    });
  };

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
    let topupBal = P.topupLoan;
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
    const interestFreed = topupExtra > 0 && topupMonths < 360 ? P.topupInterestMonthly : 0;

    // Net worth projection
    const equity1yr = propertyValue - P.mainMortgage - Math.max(0, P.topupLoan - topupExtra * 12);
    const netWorth1yr = equity1yr + sharesValue + sharesMonthly * 12 + P.vehicleValue + annualSavings;
    const netWorth3yr = propertyValue * 1.06 - P.mainMortgage - Math.max(0, P.topupLoan - topupExtra * 36) + sharesValue + sharesMonthly * 36 + P.vehicleValue + savingsTransfer * 36;
    const netWorth5yr = propertyValue * 1.10 - P.mainMortgage - Math.max(0, P.topupLoan - topupExtra * 60) + sharesValue + sharesMonthly * 60 + P.vehicleValue + savingsTransfer * 60;

    // Projection chart data
    const projData = Array.from({ length: 13 }, (_, i) => {
      const months = i * 3;
      const saved = savingsTransfer * months;
      const topPaid = Math.min(P.topupLoan, topupExtra * months);
      const propGrowth = propertyValue * (1 + 0.02 * (months / 12));
      const nw = propGrowth - P.mainMortgage - (P.topupLoan - topPaid) + sharesValue + sharesMonthly * months + P.vehicleValue + saved;
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
    let topupBal = P.topupLoan, topupMonths = 0;
    if (bTopup > 0) { while (topupBal > 0 && topupMonths < 360) { topupBal = Math.max(0, topupBal + topupBal * topupRate - bTopup); topupMonths++; } }
    const topupYears = bTopup > 0 ? (topupMonths / 12).toFixed(1) : "Never";
    const netWorth5yr = P.propertyValue * 1.10 - P.mainMortgage - Math.max(0, P.topupLoan - bTopup * 60) + sharesValue + bSharesMonthly * 60 + P.vehicleValue + bSavings * 60;
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
    const baselineIO = P.topupInterestMonthly * months;
    const compFV = (monthly, r, n) => monthly * (Math.pow(1 + r, n) - 1) / r;
    const calcTopupInterest = (mo) => {
      let bal = P.topupLoan, interest = 0;
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
    const mainSaved = Math.round(extraCash * (P.mainMortgageRatePct / 100 / 12) * months * (months + 1) / 2);
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
  const dailyTotals  = upData?.dailyTotals  ?? DEMO_DATA.dailyTotals;
  const transactions = upData?.transactions ?? DEMO_DATA.transactions;
  const filteredTxs  = useMemo(() => transactions.filter(tx => {
    const matchQ = !searchQuery || tx.desc.toLowerCase().includes(searchQuery.toLowerCase());
    const matchC = searchCat === 'all' || tx.cat === searchCat;
    return matchQ && matchC;
  }), [transactions, searchQuery, searchCat]);

  // ─── DERIVED DISPLAY METRICS ─────────────────────────────────────────────
  const bankTxCount = uploadedFiles.filter(f=>(f.type==='bank'||f.type==='upbank')&&f.status==='success').reduce((s,f)=>s+f.rowCount,0);
  const isLiveData  = bankTxCount > 0;
  const uncatCount  = isLiveData ? transactions.filter(tx => !tx.cat || tx.cat === 'other').length : 0;
  const avgMonthlyIncome = Math.round(pnl.reduce((s,r)=>s+r.i,0)/Math.max(pnl.length,1));
  const avgMonthlySpend  = Math.round(pnl.reduce((s,r)=>s+r.s,0)/Math.max(pnl.length,1));
  const avgMonthlyNet    = Math.round(pnl.reduce((s,r)=>s+r.n,0)/Math.max(pnl.length,1));
  const livePortfolioValue = shares.reduce((s,r)=>s+(r.value||0),0);
  const liveSunAvg = dow.find(d=>d.d==='Sun')?.avg ?? DEMO_DATA.insightStats.sunAvg;
  const liveMonAvg = dow.find(d=>d.d==='Mon')?.avg ?? DEMO_DATA.insightStats.monAvg;
  const totalPnlNet = pnl.reduce((s,r)=>s+r.n,0);
  const recentAvgNet = pnl.length>0 ? Math.round(pnl.slice(-2).reduce((s,r)=>s+r.n,0)/Math.min(pnl.length,2)) : 0;

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

  // ─── GOALS HELPERS ───────────────────────────────────────────────────────
  const GOAL_EMOJIS     = ['🏠','🛡️','✈️','🚗','💍','🎓','👶','💻','🏋️','🎸','🐕','💰'];
  const BS_EMOJIS       = ['🏠','💰','📈','🏦','🚗','✈️','💎','🏢','🎓','💳','🐕','💻'];
  const GOAL_TEMPLATES  = [
    { emoji:'🏠', name:'House Deposit',  targetAmount:60000, monthsOut:36 },
    { emoji:'🛡️', name:'Emergency Fund', targetAmount:10000, monthsOut:12 },
    { emoji:'✈️', name:'Holiday',        targetAmount:5000,  monthsOut:6  },
  ];
  const GOAL_COLORS      = ['#4f6ef7','#34d399','#f59e0b','#f87171','#a78bfa','#38bdf8','#fb923c','#e879f9'];
  const goalTotalTarget  = goals.reduce((s,g) => s+(g.targetAmount||0), 0);
  const goalTotalSaved   = goals.reduce((s,g) => s+(g.savedSoFar||0),   0);
  const goalPerMonthly   = goals.length > 0 && plan.surplus > 0 ? plan.surplus / goals.length : 0;
  const actualAvgSavings = upData?.pnl?.length > 0 ? Math.round(upData.pnl.reduce((s,r)=>s+r.n,0)/upData.pnl.length) : null;
  const hasActualData    = actualAvgSavings !== null;
  const goalPerActual    = hasActualData && goals.length > 0 ? actualAvgSavings / goals.length : 0;
  const goalAddMonths    = (m) => { const d = new Date(); d.setMonth(d.getMonth()+m); return d.toISOString().slice(0,10); };
  const goalFmtDate      = (ds) => { if (!ds) return '—'; const d = new Date(ds+'T00:00:00'); return d.toLocaleDateString('en-AU',{month:'short',year:'numeric'}); };
  const goalProjDate     = (g) => {
    const rem = (g.targetAmount||0) - (g.savedSoFar||0);
    if (rem <= 0) return 'Complete';
    const fmt = (mo) => { const d = new Date(); d.setMonth(d.getMonth()+mo); return d.toLocaleDateString('en-AU',{month:'short',year:'numeric'}); };
    const planMo = goalPerMonthly > 0 ? Math.ceil(rem / goalPerMonthly) : null;
    const actMo  = goalPerActual  > 0 ? Math.ceil(rem / goalPerActual)  : null;
    if (!planMo && !actMo) return 'Increase savings to project';
    if (!hasActualData || !actMo) return planMo ? fmt(planMo) : 'Increase savings to project';
    const planStr = planMo ? fmt(planMo) : null;
    const actStr  = fmt(actMo);
    if (planStr === actStr) return planStr;
    return planStr ? `Plan: ${planStr} · Actual: ${actStr}` : `Actual: ${actStr}`;
  };
  const goalProjData     = useMemo(() => {
    if (goals.length === 0) return { data: [], crossings: {}, actualCrossings: {} };
    const perGoal    = goals.length > 0 && plan.surplus > 0 ? plan.surplus / goals.length : 0;
    const perGoalAct = hasActualData && goals.length > 0 ? actualAvgSavings / goals.length : 0;
    let maxMonths = 12;
    goals.forEach(g => {
      const rem = (g.targetAmount||0) - (g.savedSoFar||0);
      if (rem > 0 && perGoal    > 0) maxMonths = Math.max(maxMonths, Math.min(36, Math.ceil(rem / perGoal)));
      if (rem > 0 && perGoalAct > 0) maxMonths = Math.max(maxMonths, Math.min(36, Math.ceil(rem / perGoalAct)));
    });
    maxMonths = Math.min(36, maxMonths);
    const data = [];
    for (let m = 0; m <= maxMonths; m++) {
      const d = new Date(); d.setMonth(d.getMonth() + m);
      const pt = { month: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }) };
      goals.forEach(g => {
        pt[g.id] = Math.round(Math.min((g.savedSoFar||0) + m * perGoal, g.targetAmount||0));
        if (hasActualData) pt[`${g.id}_act`] = Math.round(Math.min((g.savedSoFar||0) + m * perGoalAct, g.targetAmount||0));
      });
      data.push(pt);
    }
    const crossings = {};
    const actualCrossings = {};
    goals.forEach(g => {
      for (let m = 0; m <= maxMonths; m++) {
        if (!crossings[g.id] && perGoal > 0 && (g.savedSoFar||0) + m * perGoal >= (g.targetAmount||0)) {
          const d = new Date(); d.setMonth(d.getMonth() + m);
          crossings[g.id] = { month: data[m]?.month, label: d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) };
        }
        if (!actualCrossings[g.id] && hasActualData && perGoalAct > 0 && (g.savedSoFar||0) + m * perGoalAct >= (g.targetAmount||0)) {
          const d = new Date(); d.setMonth(d.getMonth() + m);
          actualCrossings[g.id] = { month: data[m]?.month, label: d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) };
        }
      }
    });
    return { data, crossings, actualCrossings };
  }, [goals, plan.surplus, hasActualData, actualAvgSavings]);
  const openGoalEdit     = (g) => { setEditingGoalId(g.id); setGoalDraft({emoji:g.emoji,name:g.name,targetAmount:String(g.targetAmount),targetDate:g.targetDate||'',savedSoFar:String(g.savedSoFar||0)}); setShowGoalForm(true); };
  const applyGoalTpl     = (t) => { setEditingGoalId(null); setGoalDraft({emoji:t.emoji,name:t.name,targetAmount:String(t.targetAmount),targetDate:goalAddMonths(t.monthsOut),savedSoFar:'0'}); setShowGoalForm(true); };
  const saveGoalDraft    = () => { const g={id:editingGoalId||('g'+Date.now()),emoji:goalDraft.emoji||'🎯',name:goalDraft.name||'Goal',targetAmount:parseFloat(goalDraft.targetAmount)||0,targetDate:goalDraft.targetDate,savedSoFar:parseFloat(goalDraft.savedSoFar)||0}; if(editingGoalId)updateGoal(editingGoalId,g);else addGoal(g); setShowGoalForm(false);setEditingGoalId(null); };
  const cancelGoalForm   = () => { setShowGoalForm(false); setEditingGoalId(null); };

  const SidebarContent = ({ onSelect }) => (
    <>
      <div style={{ padding: "0 10px", marginBottom: 12 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 17, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>Financial Dashboard</h1>
        <div style={{ color: "#475569", fontSize: 11 }}>{upData?.dateRange ? `${upData.dateRange.start} — ${upData.dateRange.end}` : "Sep '25 — Feb '26 · Demo"} · AUD</div>
      </div>
      <div style={{ padding: "0 10px", marginBottom: 16 }}>
        {isLiveData ? (
          <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 8px", borderRadius:8, background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.15)" }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#34d399", flexShrink:0 }} />
            <span style={{ fontSize:10, color:"#34d399", fontWeight:700 }}>Your data · {bankTxCount.toLocaleString()} transactions</span>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:5, padding:"5px 8px", borderRadius:8, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#475569", flexShrink:0 }} />
            <span style={{ fontSize:10, color:"#475569" }}>Demo data — upload CSV to use your own</span>
          </div>
        )}
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

  if (showWelcome) return <WelcomeScreen onLaunchDemo={handleLaunchDemo} onUploadFiles={handleWelcomeUpload} />;

  return (
    <div style={{ fontFamily: "'Instrument Sans',-apple-system,sans-serif", background: "#0b0b17", color: "#e2e8f0", minHeight: "100vh", display: "flex" }}>
      <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#e2e8f0;cursor:pointer;border:2px solid #0b0b17;box-shadow:0 0 6px rgba(96,165,250,0.5)} input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#e2e8f0;cursor:pointer;border:2px solid #0b0b17} @keyframes chatDot{0%,80%,100%{opacity:0.2}40%{opacity:1}} @keyframes fabPulse{0%,100%{box-shadow:0 4px 20px rgba(79,110,247,0.45),0 2px 8px rgba(0,0,0,0.4)}50%{box-shadow:0 4px 28px rgba(79,110,247,0.75),0 0 0 8px rgba(79,110,247,0.12),0 2px 8px rgba(0,0,0,0.4)}}`}</style>

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

      {/* ─── Categorisation nudge banner ─── */}
      {showCatHint && isLiveData && uncatCount > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(245,166,35,0.07)", border: "1px solid rgba(245,166,35,0.2)", fontSize: 12, color: "#f5a623", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: 160 }}>
            Comma auto-categorised <strong>{transactions.length - uncatCount} of {transactions.length}</strong> transactions. Tap any 'other' transaction in Search to teach Comma the rest — it only takes one tap per merchant.
          </span>
          <button onClick={() => { setTab('search'); setSearchCat('other'); }}
            style={{ background: "none", border: "1px solid rgba(245,166,35,0.3)", borderRadius: 6, color: "#f5a623", fontSize: 11, fontWeight: 600, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            Go to Search →
          </button>
          <button onClick={() => { setShowCatHint(false); localStorage.setItem('comma_categorise_hint_dismissed', 'true'); }}
            style={{ background: "none", border: "none", color: "#f5a623", fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1, opacity: 0.6, flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

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
        <Slider label="Salary" value={salary} onChange={setSalary} min={P.plannerSalaryMin} max={15000} step={100} color="#34d399" sub={`Current: $${P.plannerSalaryMin.toLocaleString()} · Target: $${P.plannerSalaryTarget.toLocaleString()}`} />
        <Slider label="Medicare rebates" value={medicare} onChange={setMedicare} min={0} max={800} step={50} color="#a78bfa" />
        <Slider label={`Rental income (${P.propertyShortName} weekly)`} value={rentalIncome} onChange={setRentalIncome} min={0} max={2500} step={50} color="#14b8a6" sub={rentalIncome > 0 ? `= $${(rentalIncome * 52 / 12).toFixed(0)}/mo from $${rentalIncome}/wk` : "Currently vacant"} prefix="$" />

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
        <Slider label="Extra on top-up loan" value={topupExtra} onChange={setTopupExtra} min={0} max={1500} step={50} color="#f97316" sub={topupExtra > 0 ? `Clears $${(P.topupLoan/1000).toFixed(0)}k in ${plan.topupYears} years` : `Interest-only forever ($${P.topupInterestMonthly}/mo)`} />
        <Slider label="Monthly shares investment" value={sharesMonthly} onChange={setSharesMonthly} min={0} max={2000} step={50} color="#a78bfa" sub={sharesMonthly > 0 ? `$${(sharesMonthly * 12).toLocaleString()}/yr into shares` : "Not investing in shares"} />

        {/* Sliders - Assets */}
        <Sec icon="🏠">Assets</Sec>
        <Slider label="Property value" value={propertyValue} onChange={setPropertyValue} min={500000} max={900000} step={10000} color="#fbbf24" sub={`Demo value: $${(P.propertyValue/1000).toFixed(0)}k`} />
        <Slider label="Share portfolio value" value={sharesValue} onChange={setSharesValue} min={0} max={100000} step={500} color="#a78bfa" sub="45% VAS · 34% VGS · 21% NDQ" />

        {/* Projections */}
        <Sec icon="📈">Net Worth Projection</Sec>
        <Ch height={200}>
          <AreaChart data={plan.projData} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>
            {gd}<XAxis dataKey="m" {...xP} /><YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<Tip />} />
            <Area dataKey="nw" name="Net Worth" stroke="#34d399" fill="#34d399" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </Ch>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <St small label="Now" value={"$" + Math.round(NW_NOW / 1000) + "k"} accent="#94a3b8" />
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
          <Row label="Property equity" value={"$" + (propertyValue - P.mainMortgage - P.topupLoan + Math.min(P.topupLoan, topupExtra * 12)).toLocaleString()} color="#fbbf24" borderTop bold />
        </div>

        {/* Quick scenarios */}
        <Sec icon="⚡">Quick Scenarios</Sec>
        <div style={{ display: "grid", gap: 5 }}>
          {[
            { label: "Current salary, conservative", action: () => { setSalary(P.plannerSalaryMin); setAmazonBudget(500); setFoodBudget(750); setSavingsTransfer(200); setTopupExtra(200); setRentalIncome(0); }, color: "#60a5fa" },
            { label: "Higher salary, aggressive savings", action: () => { setSalary(P.plannerSalaryTarget); setAmazonBudget(400); setFoodBudget(700); setSavingsTransfer(400); setTopupExtra(600); setRentalIncome(0); }, color: "#34d399" },
            { label: "Higher salary + property rented", action: () => { setSalary(P.plannerSalaryTarget); setAmazonBudget(400); setFoodBudget(700); setSavingsTransfer(800); setTopupExtra(1000); setRentalIncome(P.plannerRentalScenario); }, color: "#fbbf24" },
            { label: "Reset to current reality", action: () => { setSalary(P.plannerSalaryMin); setMedicare(P.medicareRebateMonthly); setHealth(P.overviewHealthMonthly); setTransport(P.overviewTransportMonthly); setFoodBudget(P.foodMonthlyBudget); setAmazonBudget(500); setPaypalBudget(0); setMiscBudget(400); setSavingsTransfer(200); setTopupExtra(200); setRentalIncome(0); setPropertyValue(P.propertyValue); setSharesValue(P.sharesPortfolioValue); setSharesMonthly(0); }, color: "#94a3b8" },
          ].map((s, i) => (
            <button key={i} onClick={s.action} style={{ padding: "10px 14px", borderRadius: 10, background: `${s.color}08`, border: `1px solid ${s.color}15`, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>)}

      {/* ═══ OVERVIEW ═══ */}
      {tab === "overview" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {upData ? (
            <>
              <St label="Avg Income" value={"$" + avgMonthlyIncome.toLocaleString()} sub="/mo" accent="#34d399" />
              <St label="Avg Spending" value={"$" + avgMonthlySpend.toLocaleString()} sub="/mo" accent="#f87171" />
              <St label="Avg Net" value={(avgMonthlyNet>=0?"$":"-$") + Math.abs(avgMonthlyNet).toLocaleString()} sub="/mo" accent={avgMonthlyNet>=0?"#fbbf24":"#f87171"} />
            </>
          ) : (
            <>
              <St label="Net Worth" value={"$" + NW_NOW.toLocaleString()} accent="#34d399" />
              <St label="Surplus" value={"$" + DISC.toLocaleString()} sub="Forward" accent="#fbbf24" />
              <St label="Debt" value={"$" + NW_DEBT.toLocaleString()} accent="#f87171" />
            </>
          )}
        </div>

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
          <Row label="Salary" value={"$" + S.toLocaleString()} color="#34d399" /><Row label="+Medicare" value={"+$" + P.medicareRebateMonthly} color="#a78bfa" /><Row label="=Core" value={"$" + CORE.toLocaleString()} color="#34d399" bold borderTop /><Row label="−Committed" value={"−$" + tC.toLocaleString()} color="#f87171" /><Row label="=After" value={"$" + (CORE - tC).toLocaleString()} color="#fbbf24" bold borderTop /><Row label="−Health" value={"−$" + P.overviewHealthMonthly} color="#06b6d4" /><Row label="−Transport" value={"−$" + P.overviewTransportMonthly} color="#eab308" /><Row label="=Discretionary" value={"$" + DISC.toLocaleString()} color="#f8fafc" bold borderTop />
        </div>
        <Note color="#34d399"><span style={{ color: "#34d399", fontWeight: 700 }}>Asset-rich, cash-poor. </span>{"$" + Math.round(NW_NOW/1000)}k net worth but near-breakeven monthly. Use the Planner tab to model scenarios.</Note>
        <Sec icon="⚡">One-Offs</Sec>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><Card label={P.vehicleLabel} value={"$" + P.vehiclePurchase.toLocaleString()} type="out" detail={`Via $${(P.topupLoan/1000).toFixed(0)}k top-up`} /><Card label="ATO Refund" value={"$" + P.atoRefund.toLocaleString()} type="in" detail="Jul" /><Card label="Driveway" value={"~$" + P.drivewayCost.toLocaleString()} type="out" detail="Via top-up" /><Card label="Surgery" value={"$" + P.surgeryOop.toLocaleString()} type="out" detail="Sep" /></div>
      </div>)}

      {/* ═══ NET WORTH ═══ */}
      {tab === "networth" && (() => {
        const DEFAULT_ASSET_IDS     = BS_DEFAULT_ASSETS.map(a => a.id);
        const DEFAULT_LIABILITY_IDS = BS_DEFAULT_LIABS.map(l => l.id);
        const isSheetEmpty  = bsAssets.every(a => a.value === 0) && bsLiabilities.every(l => l.value === 0);
        const useDemoSheet  = isSheetEmpty && !csData && !isLiveData;
        const demoAssets = [
          { id:'property', name:P.propertyShortName,    value:P.propertyValue,        icon:'🏠' },
          { id:'savings',  name:'Savings',               value:0,                      icon:'💰' },
          { id:'shares',   name:'Shares',                value:P.sharesPortfolioValue, icon:'📈' },
          { id:'super',    name:'Superannuation',        value:0,                      icon:'🏦' },
          { id:'vehicle',  name:P.vehicleLabel,          value:P.vehicleValue,         icon:'🚗' },
        ];
        const demoLiabs = [
          { id:'mortgage',    name:'Main mortgage', value:P.mainMortgage, icon:'🏠' },
          { id:'car_loan',    name:'Top-up loan',   value:P.topupLoan,    icon:'🚗' },
          { id:'credit_card', name:'Credit Card',   value:0,              icon:'💳' },
          { id:'hecs',        name:'HECS-HELP',     value:0,              icon:'🎓' },
        ];
        const displayAssets = useDemoSheet ? demoAssets : bsAssets;
        const displayLiabs  = useDemoSheet ? demoLiabs  : bsLiabilities;
        const getAssetEff = a => (a.id === 'shares' && csData && livePortfolioValue > 0)
          ? { value: livePortfolioValue, auto: true } : { value: a.value, auto: false };
        const totalAssets = displayAssets.reduce((s, a) => s + getAssetEff(a).value, 0);
        const totalLiab   = displayLiabs.reduce((s, l) => s + l.value, 0);
        const netWorth    = totalAssets - totalLiab;
        const propVal     = displayAssets.find(a => a.id === 'property')?.value ?? 0;
        const lvr         = propVal > 0 ? ((totalLiab / propVal) * 100).toFixed(1) : null;

        const startEdit = (type, item) => {
          if (item.id === 'shares' && csData && livePortfolioValue > 0) return;
          const realItem = (type === 'asset' ? bsAssets : bsLiabilities).find(x => x.id === item.id);
          if (!realItem) return;
          setEditingBsCell({ type, id: item.id });
          setEditingBsValue(String(realItem.value));
        };
        const commitEdit = () => {
          const val = parseFloat(String(editingBsValue).replace(/[,$\s]/g, '')) || 0;
          if (editingBsCell.type === 'asset') setBsAssets(p => p.map(a => a.id === editingBsCell.id ? { ...a, value: val } : a));
          else setBsLiabilities(p => p.map(l => l.id === editingBsCell.id ? { ...l, value: val } : l));
          setEditingBsCell(null); setEditingBsValue('');
        };
        const cancelEdit = () => { setEditingBsCell(null); setEditingBsValue(''); };
        const saveNewRow = (type) => {
          const val = parseFloat(String(newBsDraft.value).replace(/[,$\s]/g, '')) || 0;
          const row = { id: type + '_' + Date.now(), name: newBsDraft.name || (type === 'asset' ? 'Asset' : 'Liability'), value: val, icon: newBsDraft.icon };
          if (type === 'asset') { setBsAssets(p => [...p, row]); setShowAddAsset(false); }
          else { setBsLiabilities(p => [...p, row]); setShowAddLiability(false); }
          setNewBsDraft({ icon: '💰', name: '', value: '' });
        };

        const renderRow = (item, type, color) => {
          const { value: effVal, auto } = getAssetEff(item);
          const isDefault = (type === 'asset' ? DEFAULT_ASSET_IDS : DEFAULT_LIABILITY_IDS).includes(item.id);
          const isEditing = editingBsCell?.type === type && editingBsCell?.id === item.id;
          const isHov     = bsHoveredId?.type === type && bsHoveredId?.id === item.id;
          return (
            <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5, borderRadius:6, padding:'2px 4px', background: isHov ? 'rgba(255,255,255,0.03)' : 'transparent', transition:'background 0.15s' }}
              onMouseEnter={() => setBsHoveredId({ type, id: item.id })}
              onMouseLeave={() => setBsHoveredId(null)}>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:13 }}>{item.icon}</span>
                <span style={{ fontSize:11, color:'#94a3b8' }}>{item.name}</span>
                {auto && <span style={{ fontSize:9, color:'#60a5fa', background:'rgba(96,165,250,0.1)', borderRadius:4, padding:'1px 4px', lineHeight:1.4 }}>auto</span>}
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                {isEditing ? (
                  <input autoFocus style={{ background:'rgba(255,255,255,0.06)', border:`1px solid ${color}50`, borderRadius:6, padding:'2px 6px', color, fontFamily:"'JetBrains Mono',monospace", fontSize:11, width:90, outline:'none' }}
                    value={editingBsValue}
                    onChange={e => setEditingBsValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); }} />
                ) : (
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color, cursor: auto ? 'default' : 'text', textDecoration: isHov && !auto ? 'underline dotted' : 'none', textUnderlineOffset:2 }}
                    onClick={() => startEdit(type, item)}>
                    ${effVal.toLocaleString()}
                  </span>
                )}
                {!isDefault && !useDemoSheet && (
                  <button onClick={() => type === 'asset' ? setBsAssets(p => p.filter(a => a.id !== item.id)) : setBsLiabilities(p => p.filter(l => l.id !== item.id))}
                    style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:11, padding:'0 2px', lineHeight:1, opacity: isHov ? 1 : 0, transition:'opacity 0.15s' }}>✕</button>
                )}
              </div>
            </div>
          );
        };

        const renderAddForm = (type) => (
          <div style={{ marginTop:8, padding:10, borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display:'flex', gap:3, flexWrap:'wrap', marginBottom:8 }}>
              {BS_EMOJIS.map(e => (
                <button key={e} onClick={() => setNewBsDraft(d => ({ ...d, icon:e }))}
                  style={{ fontSize:15, padding:'3px 6px', borderRadius:7, cursor:'pointer', background: newBsDraft.icon === e ? 'rgba(79,110,247,0.2)' : 'rgba(255,255,255,0.04)', border: newBsDraft.icon === e ? '1px solid rgba(79,110,247,0.4)' : '1px solid rgba(255,255,255,0.06)' }}>
                  {e}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:8 }}>
              <input placeholder="Name" value={newBsDraft.name} onChange={e => setNewBsDraft(d => ({ ...d, name:e.target.value }))}
                style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'5px 8px', color:'#e2e8f0', fontSize:12, outline:'none' }} />
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#64748b', fontSize:12, pointerEvents:'none' }}>$</span>
                <input placeholder="0" type="number" value={newBsDraft.value} onChange={e => setNewBsDraft(d => ({ ...d, value:e.target.value }))}
                  style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:7, padding:'5px 8px 5px 18px', color:'#e2e8f0', fontSize:12, width:'100%', boxSizing:'border-box', outline:'none' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => saveNewRow(type)} style={{ flex:1, padding:'6px 0', borderRadius:8, background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399', fontSize:12, cursor:'pointer' }}>Save</button>
              <button onClick={() => { type === 'asset' ? setShowAddAsset(false) : setShowAddLiability(false); setNewBsDraft({ icon:'💰', name:'', value:'' }); }}
                style={{ padding:'6px 12px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', color:'#64748b', fontSize:12, cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        );

        const now = new Date();
        const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const existingThisMonth = nwSnapshots.find(s => s.date.startsWith(thisMonthKey));
        const lastSnapshot = nwSnapshots.length > 0 ? nwSnapshots[nwSnapshots.length - 1] : null;
        const lastSnapshotLabel = lastSnapshot ? (() => {
          const d = new Date(lastSnapshot.date);
          return d.toLocaleString('en-AU', { month: 'short', year: 'numeric' });
        })() : null;
        const isSheetZero = netWorth === 0 && totalAssets === 0 && totalLiab === 0;

        const doSaveSnapshot = () => {
          const snap = {
            id: thisMonthKey + '-' + Date.now(),
            date: now.toISOString(),
            netWorth,
            totalAssets,
            totalLiabilities: totalLiab,
            breakdown: {
              assets: displayAssets.map(a => ({ name: a.name, value: getAssetEff(a).value })),
              liabilities: displayLiabs.map(l => ({ name: l.name, value: l.value })),
            },
          };
          setNwSnapshots(prev => {
            const filtered = prev.filter(s => !s.date.startsWith(thisMonthKey));
            return [...filtered, snap];
          });
          setNwSnapshotConfirm(false);
          setNwSnapshotMsg('✓ Snapshot saved — $' + netWorth.toLocaleString() + ' net worth');
          setTimeout(() => setNwSnapshotMsg(null), 4000);
        };

        const handleSnapshotClick = () => {
          if (isSheetZero) return;
          if (existingThisMonth && !nwSnapshotConfirm) {
            setNwSnapshotConfirm(true);
          } else {
            doSaveSnapshot();
          }
        };

        return (<div>
          {/* Snapshot button */}
          <div style={{ marginBottom:12 }}>
            {nwSnapshotMsg ? (
              <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399', fontSize:13, fontWeight:600, textAlign:'center' }}>
                {nwSnapshotMsg}
              </div>
            ) : nwSnapshotConfirm ? (
              <div style={{ padding:'10px 14px', borderRadius:10, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.2)', fontSize:12 }}>
                <div style={{ color:'#fbbf24', fontWeight:600, marginBottom:8 }}>
                  {`You already saved a snapshot for ${now.toLocaleString('en-AU', { month: 'long', year: 'numeric' })}. Replace it?`}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={doSaveSnapshot} style={{ flex:1, padding:'7px 0', borderRadius:8, background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.35)', color:'#818cf8', fontSize:12, fontWeight:600, cursor:'pointer' }}>Replace</button>
                  <button onClick={() => setNwSnapshotConfirm(false)} style={{ padding:'7px 12px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', color:'#64748b', fontSize:12, cursor:'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div title={isSheetZero ? 'Enter your asset and liability values first' : undefined}>
                <button
                  onClick={handleSnapshotClick}
                  disabled={isSheetZero}
                  style={{ width:'100%', padding:'10px 0', borderRadius:10, background: isSheetZero ? 'rgba(99,102,241,0.04)' : 'rgba(99,102,241,0.12)', border:`1px solid ${isSheetZero ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.35)'}`, color: isSheetZero ? '#4b5563' : '#818cf8', fontSize:13, fontWeight:600, cursor: isSheetZero ? 'not-allowed' : 'pointer', transition:'all 0.15s' }}>
                  📸 Save this month's snapshot
                  {lastSnapshotLabel && !isSheetZero && <span style={{ fontWeight:400, fontSize:11, marginLeft:8, color:'#6366f1', opacity:0.8 }}>Last: {lastSnapshotLabel}</span>}
                </button>
              </div>
            )}
            {userTier === 'free' && nwSnapshots.length >= 1 && (
              <ProBadge title="Net Worth Timeline" description="Track your net worth month-over-month. See how your assets and liabilities change over time with an interactive timeline chart." />
            )}
          </div>

          {/* ── Net Worth History Chart ── */}
          {(() => {
            if (nwSnapshots.length === 0) return (
              <div style={{ marginBottom:12, padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', color:'#64748b', fontSize:12, textAlign:'center', lineHeight:1.6 }}>
                Save your first snapshot to start tracking your net worth over time.
              </div>
            );
            if (nwSnapshots.length < 2) return (
              <div style={{ marginBottom:12, padding:'12px 14px', borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', color:'#64748b', fontSize:12, textAlign:'center', lineHeight:1.6 }}>
                Your first chart will appear after your second snapshot.
              </div>
            );
            const sorted = [...nwSnapshots].sort((a,b) => a.date.localeCompare(b.date));
            const fmtLbl = d => { const x = new Date(d); return x.toLocaleString('en-AU',{month:'short',year:'2-digit'}); };
            const n = sorted.length;
            const baseData = sorted.map((s,i) => ({ label:fmtLbl(s.date), nw:s.netWorth, assets:s.totalAssets, liab:s.totalLiabilities, _snap:s, _i:i }));

            // Linear regression
            const xs = sorted.map((_,i)=>i), ys = sorted.map(s=>s.netWorth);
            const sx=xs.reduce((a,b)=>a+b,0), sy=ys.reduce((a,b)=>a+b,0);
            const sxy=xs.reduce((a,x,i)=>a+x*ys[i],0), sxx=xs.reduce((a,x)=>a+x*x,0);
            const slope=(n*sxy-sx*sy)/(n*sxx-sx*sx||1);
            const intercept=(sy-slope*sx)/n;

            const projData = n >= 3 ? Array.from({length:6},(_,k) => {
              const xi=n+k, d=new Date(sorted[n-1].date);
              d.setMonth(d.getMonth()+k+1);
              return { label:fmtLbl(d.toISOString()), projected:Math.round(intercept+slope*xi), nw:null, assets:null, liab:null };
            }) : [];

            const chartData = [
              ...baseData.map(d => ({ ...d, ...(n>=3?{projected:Math.round(intercept+slope*d._i)}:{}) })),
              ...projData,
            ];

            const latest=sorted[n-1], prev=sorted[n-2];
            const change=latest.netWorth-prev.netWorth;
            const avgChange=n>1?Math.round((sorted[n-1].netWorth-sorted[0].netWorth)/(n-1)):0;
            const nwPos=latest.netWorth>=0;

            return (
              <div style={{ marginBottom:14 }}>
                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  {[
                    { label:'Current', val:'$'+latest.netWorth.toLocaleString(), color:'#fbbf24' },
                    { label:'Change',  val:(change>=0?'+':'')+' $'+Math.abs(change).toLocaleString(), color:change>=0?'#34d399':'#f87171' },
                    { label:'Trend',   val:(avgChange>=0?'+':'')+' $'+Math.abs(avgChange).toLocaleString()+'/mo', color:avgChange>=0?'#34d399':'#f87171' },
                  ].map(s=>(
                    <div key={s.label} style={{ flex:1, padding:'8px 10px', borderRadius:10, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.06)', textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'#64748b', textTransform:'uppercase', fontWeight:700, marginBottom:3 }}>{s.label}</div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <Ch height={220}>
                  <ComposedChart data={chartData} margin={{top:5,right:12,bottom:5,left:4}}
                    onClick={e => { if(e?.activePayload?.[0]?.payload?._snap) setNwSelSnap(s => s===e.activePayload[0].payload._snap?null:e.activePayload[0].payload._snap); }}>
                    {gd}
                    <defs>
                      <linearGradient id="nwGradPos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#34d399" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0.02}/>
                      </linearGradient>
                      <linearGradient id="nwGradNeg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#f87171" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="#f87171" stopOpacity={0.02}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="label" {...xP}/>
                    <YAxis {...yP}/>
                    <Tooltip content={<Tip/>}/>
                    <Area dataKey="nw" name="Net Worth" stroke={nwPos?"#34d399":"#f87171"} fill={nwPos?"url(#nwGradPos)":"url(#nwGradNeg)"} strokeWidth={2} dot={{fill:nwPos?"#34d399":"#f87171",r:4,cursor:'pointer'}} connectNulls={false}/>
                    <Line dataKey="assets" name="Assets"      stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.45} connectNulls={false}/>
                    <Line dataKey="liab"   name="Liabilities" stroke="#f87171" strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.45} connectNulls={false}/>
                    {n>=3&&<Line dataKey="projected" name="Projected" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="3 5" dot={false} opacity={0.4} connectNulls/>}
                  </ComposedChart>
                </Ch>
                {nwSelSnap && (
                  <div style={{ marginTop:8, padding:'10px 12px', borderRadius:10, background:'rgba(99,102,241,0.07)', border:'1px solid rgba(99,102,241,0.2)', fontSize:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span style={{ color:'#818cf8', fontWeight:700 }}>{fmtLbl(nwSelSnap.date)} Snapshot</span>
                      <button onClick={()=>setNwSelSnap(null)} style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:15, padding:0, lineHeight:1 }}>×</button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                      <div>
                        <div style={{ fontSize:9, color:'#34d399', textTransform:'uppercase', fontWeight:700, marginBottom:4 }}>Assets</div>
                        {nwSelSnap.breakdown.assets.map((a,i)=>(
                          <div key={i} style={{ display:'flex', justifyContent:'space-between', color:'#94a3b8', fontSize:11, lineHeight:1.9 }}>
                            <span>{a.name}</span><span style={{ fontFamily:"'JetBrains Mono',monospace" }}>${a.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <div style={{ fontSize:9, color:'#f87171', textTransform:'uppercase', fontWeight:700, marginBottom:4 }}>Liabilities</div>
                        {nwSelSnap.breakdown.liabilities.map((l,i)=>(
                          <div key={i} style={{ display:'flex', justifyContent:'space-between', color:'#94a3b8', fontSize:11, lineHeight:1.9 }}>
                            <span>{l.name}</span><span style={{ fontFamily:"'JetBrains Mono',monospace" }}>${l.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between', fontWeight:700 }}>
                      <span style={{ color:'#fbbf24' }}>Net Worth</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'#fbbf24' }}>${nwSelSnap.netWorth.toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Snapshot List ── */}
          {nwSnapshots.length > 0 && (() => {
            const fmtDate = d => { const x = new Date(d); return x.toLocaleString('en-AU', { month: 'short', year: 'numeric' }); };
            const sorted = [...nwSnapshots].sort((a,b) => b.date.localeCompare(a.date));

            const handleExport = () => {
              const header = 'Date,Net Worth,Total Assets,Total Liabilities';
              const rows = [...nwSnapshots]
                .sort((a,b) => a.date.localeCompare(b.date))
                .map(s => `${s.date.slice(0,10)},${s.netWorth},${s.totalAssets},${s.totalLiabilities}`);
              navigator.clipboard.writeText([header, ...rows].join('\n'));
              setNwSnapshotMsg('✓ History copied to clipboard');
              setTimeout(() => setNwSnapshotMsg(null), 3000);
            };

            return (
              <div style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <div style={{ fontSize:10, color:'#64748b', textTransform:'uppercase', fontWeight:700, letterSpacing:'0.06em' }}>Snapshot History</div>
                  <button onClick={handleExport} style={{ padding:'4px 10px', borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#64748b', fontSize:11, cursor:'pointer' }}>Export CSV</button>
                </div>
                <div style={{ borderRadius:10, border:'1px solid rgba(255,255,255,0.06)', overflow:'hidden' }}>
                  {sorted.map((snap, idx) => {
                    const prevSnap = sorted[idx + 1];
                    const change = prevSnap ? snap.netWorth - prevSnap.netWorth : null;
                    const isExpanded = nwExpandedSnaps.has(snap.id);
                    const isPendingDelete = nwDeleteConfirm === snap.id;
                    return (
                      <div key={snap.id} style={{ borderBottom: idx < sorted.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <div style={{ display:'flex', alignItems:'center', padding:'9px 12px', gap:8 }}>
                          <button
                            onClick={() => setNwExpandedSnaps(prev => { const s = new Set(prev); s.has(snap.id) ? s.delete(snap.id) : s.add(snap.id); return s; })}
                            style={{ background:'none', border:'none', color:'#64748b', cursor:'pointer', fontSize:10, padding:0, lineHeight:1, flexShrink:0, width:14, textAlign:'center' }}>
                            {isExpanded ? '▼' : '▶'}
                          </button>
                          <span style={{ fontSize:12, color:'#94a3b8', minWidth:72 }}>{fmtDate(snap.date)}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:'#fbbf24', flex:1 }}>${snap.netWorth.toLocaleString()}</span>
                          {change !== null && (
                            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color: change >= 0 ? '#34d399' : '#f87171', minWidth:78, textAlign:'right' }}>
                              {change >= 0 ? '+' : '−'}${Math.abs(change).toLocaleString()}
                            </span>
                          )}
                          {isPendingDelete ? (
                            <div style={{ display:'flex', gap:4, alignItems:'center', flexShrink:0, marginLeft:6 }}>
                              <span style={{ fontSize:11, color:'#f87171' }}>Delete?</span>
                              <button onClick={() => { setNwSnapshots(prev => prev.filter(s => s.id !== snap.id)); setNwDeleteConfirm(null); }} style={{ padding:'2px 7px', borderRadius:5, background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.3)', color:'#f87171', fontSize:11, cursor:'pointer', fontWeight:600 }}>Yes</button>
                              <button onClick={() => setNwDeleteConfirm(null)} style={{ padding:'2px 7px', borderRadius:5, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#64748b', fontSize:11, cursor:'pointer' }}>No</button>
                            </div>
                          ) : (
                            <button onClick={() => setNwDeleteConfirm(snap.id)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:14, padding:'0 2px', lineHeight:1, flexShrink:0, marginLeft:4 }} title="Delete snapshot">✕</button>
                          )}
                        </div>
                        {isExpanded && (
                          <div style={{ padding:'8px 12px 10px 36px', background:'rgba(99,102,241,0.04)', borderTop:'1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                              <div>
                                <div style={{ fontSize:9, color:'#34d399', textTransform:'uppercase', fontWeight:700, marginBottom:4 }}>Assets</div>
                                {snap.breakdown.assets.map((a,i) => (
                                  <div key={i} style={{ display:'flex', justifyContent:'space-between', color:'#94a3b8', fontSize:11, lineHeight:1.9 }}>
                                    <span>{a.name}</span><span style={{ fontFamily:"'JetBrains Mono',monospace" }}>${a.value.toLocaleString()}</span>
                                  </div>
                                ))}
                                <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:4, paddingTop:4, display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700, color:'#34d399' }}>
                                  <span>Total</span><span style={{ fontFamily:"'JetBrains Mono',monospace" }}>${snap.totalAssets.toLocaleString()}</span>
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize:9, color:'#f87171', textTransform:'uppercase', fontWeight:700, marginBottom:4 }}>Liabilities</div>
                                {snap.breakdown.liabilities.map((l,i) => (
                                  <div key={i} style={{ display:'flex', justifyContent:'space-between', color:'#94a3b8', fontSize:11, lineHeight:1.9 }}>
                                    <span>{l.name}</span><span style={{ fontFamily:"'JetBrains Mono',monospace" }}>${l.value.toLocaleString()}</span>
                                  </div>
                                ))}
                                <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:4, paddingTop:4, display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700, color:'#f87171' }}>
                                  <span>Total</span><span style={{ fontFamily:"'JetBrains Mono',monospace" }}>${snap.totalLiabilities.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <St label="Assets"    value={"$" + totalAssets.toLocaleString()} accent="#34d399" />
            <St label="Debt"      value={"$" + totalLiab.toLocaleString()}   accent="#f87171" />
            <St label="Net Worth" value={"$" + netWorth.toLocaleString()}     accent="#fbbf24" />
          </div>
          {useDemoSheet && <Note color="#475569">Demo figures. Click any value to enter your own.</Note>}
          <Sec icon="📊">Balance Sheet</Sec>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div style={{ background:"rgba(52,211,153,0.04)", borderRadius:14, border:"1px solid rgba(52,211,153,0.08)", padding:14 }}>
              <div style={{ fontSize:10, color:"#34d399", textTransform:"uppercase", fontWeight:700, marginBottom:10 }}>Assets</div>
              {displayAssets.map(a => renderRow(a, 'asset', '#34d399'))}
              <div style={{ borderTop:"1px solid rgba(52,211,153,0.1)", paddingTop:6, display:"flex", justifyContent:"space-between" }}><span style={{ fontWeight:700 }}>Total</span><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"#34d399" }}>{"$" + totalAssets.toLocaleString()}</span></div>
              {!useDemoSheet && (showAddAsset ? renderAddForm('asset') :
                <button onClick={() => { setShowAddAsset(true); setShowAddLiability(false); setNewBsDraft({ icon:'💰', name:'', value:'' }); }}
                  style={{ marginTop:8, width:'100%', padding:'5px 0', borderRadius:8, background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.12)', color:'#34d399', fontSize:11, cursor:'pointer' }}>+ Add asset</button>
              )}
            </div>
            <div style={{ background:"rgba(248,113,113,0.04)", borderRadius:14, border:"1px solid rgba(248,113,113,0.08)", padding:14 }}>
              <div style={{ fontSize:10, color:"#f87171", textTransform:"uppercase", fontWeight:700, marginBottom:10 }}>Liabilities</div>
              {displayLiabs.map(l => renderRow(l, 'liability', '#f87171'))}
              <div style={{ borderTop:"1px solid rgba(248,113,113,0.1)", paddingTop:6, display:"flex", justifyContent:"space-between" }}><span style={{ fontWeight:700 }}>Total</span><span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:"#f87171" }}>{"$" + totalLiab.toLocaleString()}</span></div>
              {!useDemoSheet && (showAddLiability ? renderAddForm('liability') :
                <button onClick={() => { setShowAddLiability(true); setShowAddAsset(false); setNewBsDraft({ icon:'💳', name:'', value:'' }); }}
                  style={{ marginTop:8, width:'100%', padding:'5px 0', borderRadius:8, background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.12)', color:'#f87171', fontSize:11, cursor:'pointer' }}>+ Add liability</button>
              )}
            </div>
          </div>
          <div style={{ textAlign:"center", marginTop:12, padding:14, borderRadius:12, background:"rgba(251,191,36,0.06)", border:"1px solid rgba(251,191,36,0.1)" }}>
            <div style={{ fontSize:10, color:"#fbbf24", textTransform:"uppercase", fontWeight:700, marginBottom:4 }}>Net Worth</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:800, color:"#fbbf24" }}>{"$" + netWorth.toLocaleString()}</div>
            {lvr && <div style={{ fontSize:10, color:"#475569", marginTop:3 }}>{`LVR ${lvr}% · Property equity $${Math.round((propVal - totalLiab) / 1000)}k`}</div>}
          </div>
          <Sec icon="📈">{`Shares ($${livePortfolioValue.toLocaleString()})`}</Sec>
          <div style={{ background:"rgba(255,255,255,0.015)", borderRadius:14, border:"1px solid rgba(255,255,255,0.045)", padding:4 }}>
            {shares.map((s, i) => (<div key={i} style={{ display:"grid", gridTemplateColumns:"40px 1fr 55px 55px", padding:"5px 10px", borderBottom: i < shares.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, fontWeight:700, color:s.color }}>{s.code}</span><div style={{ height:5, background:"rgba(255,255,255,0.03)", borderRadius:3, overflow:"hidden", alignSelf:"center" }}><div style={{ width:`${s.pct}%`, height:"100%", background:s.color, opacity:0.5, borderRadius:3 }} /></div><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#cbd5e1", textAlign:"right" }}>${s.value.toLocaleString()}</span><span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:s.pl >= 0 ? "#34d399" : "#f87171", textAlign:"right" }}>{s.pl >= 0 ? "+" : ""}${s.pl.toLocaleString()}</span></div>))}
          </div>
          <Note color="#fbbf24"><span style={{ color:"#fbbf24", fontWeight:700 }}>VAS is the largest holding at 45%. </span>Diversified across 3 ETFs.</Note>
        </div>);
      })()}

      {/* ═══ PROPERTY ═══ */}
      {/* TODO: Allow manual input of property value, mortgage balance, and interest rate instead of using hardcoded demo profile values. */}
      {tab === "property" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Value" value={"$" + (P.propertyValue/1000).toFixed(0) + "k"} accent="#34d399" /><St label="Debt" value={"$" + Math.round(NW_DEBT/1000) + "k"} accent="#f87171" /><St label="Equity" value={"$" + Math.round((P.propertyValue-NW_DEBT)/1000) + "k"} accent="#fbbf24" /></div>
        <Sec icon="📊">Mortgage Balance</Sec>
        <Ch height={190}><ComposedChart data={mortBal} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="m" {...xP} /><YAxis domain={[370000, 435000]} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<Tip />} /><Area dataKey="main" name="Main" stroke="#f87171" fill="#f87171" fillOpacity={0.1} strokeWidth={2} /><Area dataKey="top" name="Top-Up" stroke="#f97316" fill="#f97316" fillOpacity={0.1} strokeWidth={2} /></ComposedChart></Ch>
        <Note color="#f87171">{P.interestToPaymentPct}% of main mortgage payments go to interest. Only ${P.principalMonthly}/mo reduces principal.</Note>
        <Sec icon="💰">{`Monthly Costs ($${(P.mainInterestMonthly + P.topupInterestMonthly + P.ratesMonthly + P.lpgMonthly).toLocaleString()}/mo)`}</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 12 }}>
          <Row label="Main interest" value={"$" + P.mainInterestMonthly.toLocaleString()} color="#f87171" note={P.mainMortgageRatePct + "%"} /><Row label="Top-up interest" value={"$" + P.topupInterestMonthly} color="#f97316" note={P.topupLoanRatePct + "% IO"} /><Row label="Rates+tax+water" value={"$" + P.ratesMonthly} /><Row label="LPG" value={"$" + P.lpgMonthly} /><Row label="Total" value={"$" + (P.mainInterestMonthly + P.topupInterestMonthly + P.ratesMonthly + P.lpgMonthly).toLocaleString() + "/mo"} color="#f87171" bold borderTop />
        </div>
        <Sec icon="📉">Top-Up Payoff</Sec>
        <Ch height={180}><LineChart data={topupPayoff} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="m" tickFormatter={v => `M${v}`} {...xP} /><YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "#64748b", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip content={<Tip />} /><Line dataKey="b6" name="$600/mo" stroke="#34d399" strokeWidth={2} dot={false} /><Line dataKey="b4" name="$400/mo" stroke="#60a5fa" strokeWidth={2} dot={false} /><Line dataKey="b2" name="$200/mo" stroke="#fbbf24" strokeWidth={2} dot={false} /><ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" /></LineChart></Ch>
        <Lg items={[["$600/mo (6.5yr)", "#34d399"], ["$400/mo (9yr)", "#60a5fa"], ["$200/mo (14yr)", "#fbbf24"]]} />
        <Sec icon="🏠">Personal</Sec>
        <div style={{ background: "rgba(96,165,250,0.04)", borderRadius: 12, border: "1px solid rgba(96,165,250,0.1)", padding: 14, fontSize: 12, color: "#94a3b8", lineHeight: 1.6 }}>Family property. Held for personal reasons. The Planner tab lets you model "what if" rental scenarios without commitment.</div>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Historical" value={"$" + P.healthHistorical.toLocaleString()} accent="#f87171" /><St label="Forward" value={"~$" + P.overviewHealthMonthly} sub="Net" accent="#06b6d4" /></div>
        <Sec icon="📊">Monthly</Sec>
        <Ch height={190}><ComposedChart data={hm.map(d => ({ month: d.m, recurring: d.rec, oneoff: d.one, medicare: d.mc }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="recurring" name="Recurring" stackId="a" fill="#06b6d4" barSize={22} opacity={0.6} /><Bar dataKey="oneoff" name="One-Off" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={22} opacity={0.5} /><Line dataKey="medicare" name="Medicare" stroke="#34d399" strokeWidth={2} dot={{ fill: "#34d399", r: 3 }} strokeDasharray="4 2" /></ComposedChart></Ch>
        <Sec icon="📋">Categories</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: "10px 14px" }}>
          {hcats.map((c, i) => (<div key={i} style={{ marginBottom: 5, opacity: c.n === "Surgery" ? 0.5 : 1 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 75, fontSize: 10, color: "#94a3b8", textAlign: "right" }}>{c.n}</div><div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.025)", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${(c.t / P.surgeryOop) * 100}%`, height: "100%", background: c.c, opacity: 0.6, borderRadius: 3 }} /></div><div style={{ width: 45, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1", textAlign: "right" }}>${c.t.toLocaleString()}</div></div>{c.no && <div style={{ fontSize: 9, color: "#475569", paddingLeft: 85 }}>{c.no}</div>}</div>))}
        </div>
      </div>)}

      {/* ═══ VARIABLE ═══ */}
      {tab === "variable" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Discretionary" value={"$" + DISC.toLocaleString()} accent="#fbbf24" /><St label="Amz+PP" value={"$" + P.amazonRecentAvg} sub="Jan-Feb" accent="#34d399" /></div>
        <Sec icon="🍔">{`Food ($${P.foodMonthlyBudget}/mo)`}</Sec>
        <Ch height={180}><BarChart data={food.map(d => ({ month: d.m, restaurants: d.r, takeaway: d.t, groceries: d.g }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="restaurants" name="Restaurants" stackId="a" fill="#ec4899" barSize={22} /><Bar dataKey="takeaway" name="Takeaway" stackId="a" fill="#f43f5e" barSize={22} /><Bar dataKey="groceries" name="Groceries" stackId="a" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={22} /></BarChart></Ch>
        <Sec icon="📦">{`Amazon ($${P.amazonRecentAvg} recent)`}</Sec>
        <Ch height={150}><BarChart data={amz.map(d => ({ month: d.m, amount: d.v }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="amount" name="Amazon" fill="#f97316" radius={[4, 4, 0, 0]} barSize={26} /></BarChart></Ch>
      </div>)}

      {/* ═══ PAYPAL ═══ */}
      {tab === "paypal" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Gross" value={"$" + P.ppGross.toLocaleString()} accent="#f87171" /><St label="Refunds" value={"-$" + P.ppRefunds.toLocaleString()} accent="#34d399" /><St label="Net" value={"$" + P.ppNet.toLocaleString()} accent="#fbbf24" /></div>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Drawn" value={"$" + P.savingsDrawn.toLocaleString()} accent="#f87171" /><St label="Avg" value={"$" + P.savingsMonthlyAvg.toLocaleString()} sub="/mo" accent="#fbbf24" /></div>
        <Sec icon="📊">By Source</Sec>
        <Ch height={190}><BarChart data={sdr.map(d => ({ month: d.m, Investment: d.inv, Savings: d.sav, Other: d.oth }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="Investment" stackId="a" fill="#f87171" barSize={22} /><Bar dataKey="Savings" stackId="a" fill="#fbbf24" barSize={22} /><Bar dataKey="Other" stackId="a" fill="#60a5fa" radius={[3, 3, 0, 0]} barSize={22} /></BarChart></Ch>
        <Sec icon="🎯">Strategy</Sec>
        <div style={{ display: "grid", gap: 5 }}>
          {[{ t: "Phase 1: Buffer $2-3k", d: "$400/mo → savings (6 months)", c: "#60a5fa" }, { t: "Phase 2: Split", d: "$200 savings + $200 top-up", c: "#fbbf24" }, { t: "Phase 3: Higher salary", d: "$400 savings + $600 top-up", c: "#34d399" }].map((s, i) => (<div key={i} style={{ padding: 8, borderRadius: 8, background: `${s.c}05`, border: `1px solid ${s.c}10` }}><span style={{ fontSize: 11, fontWeight: 700, color: s.c }}>{s.t}</span><div style={{ fontSize: 10, color: "#94a3b8" }}>{s.d}</div></div>))}
        </div>
        <Sec icon="👫">Jordan</Sec>
        <Ch height={160}><BarChart data={saf.map(d => ({ month: d.m, rent: d.rent, other: d.o }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="rent" name="Rent" fill="#60a5fa" barSize={18} opacity={0.5} /><Bar dataKey="other" name="Other" fill="#34d399" barSize={18} /></BarChart></Ch>
      </div>)}

      {/* ═══ INSIGHTS ═══ */}
      {tab === "insights" && (<div>
        <Sec icon="📅">Day of Week</Sec>
        <Ch height={160}><BarChart data={dow.map(d => ({ day: d.d, avg: d.avg }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="day" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="avg" name="Avg/txn" radius={[4, 4, 0, 0]} barSize={24} opacity={0.7}>{dow.map((d, i) => <Cell key={i} fill={d.avg > 200 ? "#f87171" : d.avg > 150 ? "#fbbf24" : "#6366f1"} />)}</Bar></BarChart></Ch>
        <Note color="#f87171"><span style={{ color: "#f87171", fontWeight: 700 }}>Sun ${liveSunAvg} & Mon ${liveMonAvg}</span> — highest spend days.</Note>
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
        <Sec icon="🏍️">{P.vehicleLabel} ROI</Sec>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St small label="Toll Save" value={"$" + P.vehicleRoiTollSave} accent="#34d399" /><St small label="Interest" value={"$" + P.vehicleRoiInterest} accent="#f97316" /><St small label="Net" value={"$" + P.vehicleRoiNet + "/mo"} accent="#fbbf24" /><St small label="Break-even" value={P.vehicleRoiBreakEven} accent="#94a3b8" /></div>
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
        {userTier === 'free' && (
          <ProBadge title="Historical Analysis" description="Compare spending velocity across months, track your scorecard over time, and see how your compound costs evolve with 12 months of data." />
        )}
      </div>)}

      {/* ═══ TREND ═══ */}
      {tab === "trend" && (<div>
        {userTier === 'free' && (
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{ filter: 'blur(5px)', opacity: 0.35, pointerEvents: 'none', userSelect: 'none' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {['Period Net','Income','Spending','Savings Rate'].map(l => (
                  <div key={l} style={{ flex: 1, minWidth: 90, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div style={{ fontSize: 10, color: '#475569', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#e2e8f0', fontFamily: "'JetBrains Mono',monospace" }}>$—</div>
                  </div>
                ))}
              </div>
              <div style={{ height: 160, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 8 }} />
              <div style={{ height: 120, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }} />
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
              <div style={{ width: '100%', maxWidth: 360 }}>
                <ProBadge title="Spending Trends" description="Month-over-month comparisons, seasonal patterns, and actionable insights. See what's improving and what needs attention." />
              </div>
            </div>
          </div>
        )}
        {userTier !== 'free' && (<>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {upData ? (
              <>
                <St label="Period Net" value={(totalPnlNet>=0?"$":"-$") + Math.abs(totalPnlNet).toLocaleString()} accent={totalPnlNet>=0?"#34d399":"#f87171"} />
                <St label="Recent Avg" value={(recentAvgNet>=0?"+$":"-$") + Math.abs(recentAvgNet).toLocaleString()} sub="/mo" accent={recentAvgNet>=0?"#34d399":"#f87171"} />
              </>
            ) : (
              <>
                <St label="8-Mo Deficit" value={"-$" + DEMO_DATA.trendStats.deficit8mo.toLocaleString()} accent="#f87171" />
                <St label="Forward" value={"+" + "$" + DEMO_DATA.trendStats.forward} accent="#34d399" />
              </>
            )}
          </div>
          <Sec icon="📉">Amazon + PayPal</Sec>
          <Ch height={190}><BarChart data={cd.map(d => ({ month: d.m, Amazon: d.a, PayPal: d.p }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="Amazon" stackId="a" fill="#f97316" barSize={24} /><Bar dataKey="PayPal" stackId="a" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={24} /></BarChart></Ch>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.08)" }}><div style={{ fontSize: 9, color: "#f87171", textTransform: "uppercase", fontWeight: 700 }}>Jul—Dec</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: "#f87171" }}>{"$" + DEMO_DATA.trendStats.julDec.toLocaleString()}</div></div>
            <div style={{ padding: 12, borderRadius: 10, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.08)" }}><div style={{ fontSize: 9, color: "#34d399", textTransform: "uppercase", fontWeight: 700 }}>Jan—Feb</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: "#34d399" }}>{"$" + DEMO_DATA.trendStats.janFeb}</div></div>
          </div>
          <Sec icon="✅">Actioned</Sec>
          <div style={{ display: "grid", gap: 3 }}>
            {DEMO_DATA.actioned.map((w, i) => (<div key={i} style={{ padding: "5px 10px", borderRadius: 7, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.08)", display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 10, color: "#cbd5e1" }}>{w.a}</span><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, color: "#34d399" }}>{w.s}/mo</span></div>))}
          </div>
        </>)}
      </div>)}

      {/* ═══ SUBS ═══ */}
      {/* TODO: Auto-detect subscriptions from uploaded transaction data using MERCHANT_MAP 'sub' patterns. Currently hardcoded. */}
      {tab === "subs" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Monthly" value={"$" + tSM.toFixed(0)} accent="#60a5fa" /><St label="Annual" value="~$62" sub="/mo" accent="#a78bfa" /></div>
        <Note color="#34d399"><span style={{ color: "#34d399", fontWeight: 700 }}>Cut: </span>Some subs cut. Saved $91/mo.</Note>
        <Sec icon="📅">Monthly</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {sm.map((s, i) => (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: i < sm.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: s.t === "e" ? "#34d399" : "#94a3b8" }} /><span style={{ fontSize: 11, color: "#e2e8f0" }}>{s.n}</span>{s.no && <span style={{ fontSize: 9, color: "#475569" }}>— {s.no}</span>}</div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#cbd5e1" }}>${s.c % 1 ? s.c.toFixed(2) : s.c}</span></div>))}
        </div>
        <Sec icon="📆">Annual</Sec>
        <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", padding: 4 }}>
          {sa.map((s, i) => { const tc = s.t === "e" ? "#34d399" : s.t === "r" ? "#fbbf24" : s.t === "p" ? "#60a5fa" : "#94a3b8"; return (<div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", borderBottom: i < sa.length - 1 ? "1px solid rgba(255,255,255,0.025)" : "none" }}><div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 4, height: 4, borderRadius: "50%", background: tc }} /><span style={{ fontSize: 11, color: "#e2e8f0" }}>{s.n}</span><span style={{ fontSize: 9, color: "#475569" }}>— {s.f}</span></div><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#cbd5e1" }}>${s.c}/yr</span></div>); })}
        </div>
      </div>)}

      {/* ═══ GOALS ═══ */}
      {tab === "goals" && (<div>
        {/* Stat cards */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
          <St label="Total Target"      value={'$'+goalTotalTarget.toLocaleString()} accent="#4f6ef7" />
          <St label="Total Saved"       value={'$'+goalTotalSaved.toLocaleString()}  accent="#34d399" />
          <St label="Planned Surplus"   value={(plan.surplus>=0?'$':'-$')+Math.abs(plan.surplus).toLocaleString()} accent={plan.surplus>=200?'#34d399':plan.surplus>=0?'#fbbf24':'#f87171'} />
          {hasActualData && <St label="Actual Avg Savings" value={(actualAvgSavings>=0?'$':'-$')+Math.abs(actualAvgSavings).toLocaleString()} accent={actualAvgSavings>=200?'#34d399':actualAvgSavings>=0?'#fbbf24':'#f87171'} />}
        </div>

        {/* Projection chart */}
        {goals.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color:'#64748b', marginBottom: 6, textTransform:'uppercase', letterSpacing:'0.09em', fontWeight:600 }}>Savings Projection</div>
            {userTier === 'free' ? (
              <ProBadge title="Goal Projections" description="See when you'll reach your goals based on your actual savings rate. Track progress with projected completion dates and visual timelines." />
            ) : (
              plan.surplus <= 0 && !hasActualData ? (
                <Note color="#f87171">Adjust your Planner to increase monthly surplus — projection unavailable</Note>
              ) : (
                <>
                  <Ch height={220}>
                    <ComposedChart data={goalProjData.data}>
                      <defs>
                        {goals.map((g,i) => (
                          <linearGradient key={g.id} id={`gp_${g.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={GOAL_COLORS[i % GOAL_COLORS.length]} stopOpacity={0.25}/>
                            <stop offset="95%" stopColor={GOAL_COLORS[i % GOAL_COLORS.length]} stopOpacity={0}/>
                          </linearGradient>
                        ))}
                      </defs>
                      {gd}
                      <XAxis dataKey="month" {...xP} interval="preserveStartEnd"/>
                      <YAxis {...yP}/>
                      <Tooltip content={<Tip/>}/>
                      {/* Actual savings lines — solid Area (shown when uploaded data exists) */}
                      {hasActualData && goalPerActual > 0 && goals.map((g,i) => (
                        <Area key={`act_${g.id}`} type="monotone" dataKey={`${g.id}_act`} name={`${g.emoji} ${g.name} (actual)`}
                          stroke={GOAL_COLORS[i % GOAL_COLORS.length]} fill={`url(#gp_${g.id})`}
                          strokeWidth={2.5} dot={false} activeDot={{r:4}}/>
                      ))}
                      {/* Plan lines — dashed Line when actual data exists, Area otherwise */}
                      {goals.map((g,i) => hasActualData && plan.surplus > 0 ? (
                        <Line key={`plan_${g.id}`} type="monotone" dataKey={g.id} name={`${g.emoji} ${g.name} (plan)`}
                          stroke={GOAL_COLORS[i % GOAL_COLORS.length]} strokeWidth={1.5} strokeDasharray="5 3"
                          dot={false} activeDot={{r:3}}/>
                      ) : !hasActualData && plan.surplus > 0 ? (
                        <Area key={g.id} type="monotone" dataKey={g.id} name={`${g.emoji} ${g.name}`}
                          stroke={GOAL_COLORS[i % GOAL_COLORS.length]} fill={`url(#gp_${g.id})`}
                          strokeWidth={2} dot={false} activeDot={{r:4}}/>
                      ) : null)}
                      {goals.map((g,i) => (
                        <ReferenceLine key={`ref_${g.id}`} y={g.targetAmount||0}
                          stroke={GOAL_COLORS[i % GOAL_COLORS.length]} strokeDasharray="4 4" strokeOpacity={0.5}
                          label={{value:`${g.emoji} ${(g.targetAmount||0).toLocaleString()}`,fill:GOAL_COLORS[i % GOAL_COLORS.length],fontSize:9,position:'insideTopRight'}}/>
                      ))}
                      {/* Plan crossing dots */}
                      {plan.surplus > 0 && Object.entries(goalProjData.crossings).map(([gid, cross]) => {
                        const i = goals.findIndex(g2 => g2.id === gid);
                        if (i < 0) return null;
                        return <ReferenceDot key={`dot_${gid}`} x={cross.month} y={goals[i].targetAmount||0}
                          r={5} fill={GOAL_COLORS[i % GOAL_COLORS.length]} stroke="#111127" strokeWidth={2}
                          label={{value:`✓ ${cross.label}${hasActualData?' (plan)':''}`,fill:GOAL_COLORS[i % GOAL_COLORS.length],fontSize:9,position:'top'}}/>;
                      })}
                      {/* Actual crossing dots */}
                      {hasActualData && goalPerActual > 0 && Object.entries(goalProjData.actualCrossings).map(([gid, cross]) => {
                        const i = goals.findIndex(g2 => g2.id === gid);
                        if (i < 0) return null;
                        return <ReferenceDot key={`actdot_${gid}`} x={cross.month} y={goals[i].targetAmount||0}
                          r={5} fill={GOAL_COLORS[i % GOAL_COLORS.length]} stroke="#34d399" strokeWidth={2}
                          label={{value:`✓ ${cross.label} (actual)`,fill:'#34d399',fontSize:9,position:'bottom'}}/>;
                      })}
                    </ComposedChart>
                  </Ch>
                  {hasActualData ? (
                    <div style={{ display:'flex', justifyContent:'center', gap:16, padding:'5px 0', fontSize:11, color:'#64748b', flexWrap:'wrap' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ display:'inline-block', width:18, height:2, background:'#94a3b8', borderRadius:1 }}/>Based on your spending</span>
                      <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ display:'inline-block', width:18, height:2, borderRadius:1, opacity:0.5, borderTop:'2px dashed #94a3b8' }}/>Based on your plan</span>
                    </div>
                  ) : (
                    <Lg items={goals.map((g,i) => [`${g.emoji} ${g.name}`, GOAL_COLORS[i % GOAL_COLORS.length]])}/>
                  )}
                </>
              )
            )}
          </div>
        )}

        {/* Empty state */}
        {goals.length===0 && !showGoalForm && (
          <div style={{ textAlign:'center', padding:'40px 20px' }}>
            <div style={{ fontSize:38, marginBottom:12, opacity:0.25 }}>🎯</div>
            <div style={{ fontSize:15, fontWeight:600, color:'#94a3b8', marginBottom:6 }}>No goals yet</div>
            <div style={{ fontSize:13, color:'#475569', marginBottom:24 }}>Set a savings target and track your progress</div>
            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
              {GOAL_TEMPLATES.map(t=>(
                <button key={t.name} onClick={()=>applyGoalTpl(t)}
                  style={{ background:'rgba(79,110,247,0.08)', border:'1px solid rgba(79,110,247,0.2)', borderRadius:10, padding:'10px 16px', color:'#a5b4fc', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Goal cards */}
        {goals.map(g=>{
          const pct = g.targetAmount>0 ? Math.min(100,Math.round((g.savedSoFar/g.targetAmount)*100)) : 0;
          const proj = goalProjDate(g);
          const isDeleting = deletingGoalId===g.id;
          return (
            <div key={g.id} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'14px 16px', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div style={{ fontSize:14, fontWeight:700, color:'#e2e8f0' }}>{g.emoji} {g.name}</div>
                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <button onClick={()=>openGoalEdit(g)} style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', fontSize:14, padding:'0 3px', lineHeight:1 }} title="Edit">✎</button>
                  {isDeleting ? (
                    <>
                      <button onClick={()=>{deleteGoal(g.id);setDeletingGoalId(null);}} style={{ background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:6, color:'#f87171', fontSize:11, fontWeight:600, cursor:'pointer', padding:'2px 8px' }}>Delete</button>
                      <button onClick={()=>setDeletingGoalId(null)} style={{ background:'none', border:'none', color:'#64748b', fontSize:11, cursor:'pointer', padding:'2px 4px' }}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={()=>setDeletingGoalId(g.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#64748b', fontSize:14, padding:'0 3px', lineHeight:1 }} title="Delete">✕</button>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ flex:1, height:8, borderRadius:4, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
                  <div style={{ width:`${pct}%`, height:'100%', borderRadius:4, background:'#4f6ef7', transition:'width 0.4s' }} />
                </div>
                <span style={{ fontSize:11, color:'#64748b', fontFamily:"'JetBrains Mono',monospace", minWidth:32, textAlign:'right' }}>{pct}%</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#64748b', marginBottom:4 }}>
                <span>${(g.savedSoFar||0).toLocaleString()} saved of ${(g.targetAmount||0).toLocaleString()}</span>
                <span>{pct}% complete</span>
              </div>
              <div style={{ fontSize:11, color:'#475569' }}>
                {userTier === 'free' ? (
                  <span style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#7c3aed', background:'rgba(124,58,237,0.12)', padding:'2px 7px', borderRadius:4 }}>Pro</span>
                ) : (
                  <>
                    {proj.startsWith('Plan:') ? proj : <>Projected: <span style={{ color:proj==='Complete'?'#34d399':proj.includes('Increase')?'#f87171':'#94a3b8' }}>{proj}</span></>}
                    {g.targetDate && <span style={{ marginLeft:8, color:'#334155' }}>· Target: {goalFmtDate(g.targetDate)}</span>}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Quick-start templates (when goals exist) */}
        {goals.length>0 && !showGoalForm && (
          <div style={{ marginTop:8, marginBottom:10 }}>
            <div style={{ fontSize:10, color:'#334155', marginBottom:6, textTransform:'uppercase', letterSpacing:'0.09em', fontWeight:600 }}>Quick-start templates</div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {GOAL_TEMPLATES.map(t=>(
                <button key={t.name} onClick={()=>applyGoalTpl(t)}
                  style={{ background:'rgba(79,110,247,0.05)', border:'1px solid rgba(79,110,247,0.14)', borderRadius:8, padding:'5px 11px', color:'#818cf8', fontSize:12, fontWeight:500, cursor:'pointer' }}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add Goal button */}
        {!showGoalForm && (
          <button onClick={()=>{setEditingGoalId(null);setGoalDraft({emoji:'🎯',name:'',targetAmount:'',targetDate:'',savedSoFar:'0'});setShowGoalForm(true);}}
            style={{ width:'100%', padding:'9px 0', borderRadius:10, background:'rgba(79,110,247,0.09)', border:'1px solid rgba(79,110,247,0.2)', color:'#818cf8', fontSize:13, fontWeight:600, cursor:'pointer', marginTop:4 }}>
            + Add Goal
          </button>
        )}

        {/* Add / Edit form */}
        {showGoalForm && (
          <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:16, marginTop:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginBottom:12 }}>{editingGoalId ? 'Edit Goal' : 'New Goal'}</div>
            {/* Emoji picker */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:6 }}>Emoji</div>
              <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                {GOAL_EMOJIS.map(e=>(
                  <button key={e} onClick={()=>setGoalDraft(d=>({...d,emoji:e}))}
                    style={{ fontSize:18, padding:'4px 7px', borderRadius:8, cursor:'pointer', background:goalDraft.emoji===e?'rgba(79,110,247,0.2)':'rgba(255,255,255,0.04)', border:goalDraft.emoji===e?'1px solid rgba(79,110,247,0.4)':'1px solid rgba(255,255,255,0.06)' }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            {/* Name */}
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Name</div>
              <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px', color:'#e2e8f0', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }}
                placeholder="e.g. House Deposit" value={goalDraft.name} onChange={e=>setGoalDraft(d=>({...d,name:e.target.value}))} />
            </div>
            {/* Target + Saved */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Target Amount</div>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#64748b', fontSize:13, pointerEvents:'none' }}>$</span>
                  <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px 7px 22px', color:'#e2e8f0', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }}
                    type="number" placeholder="60000" value={goalDraft.targetAmount} onChange={e=>setGoalDraft(d=>({...d,targetAmount:e.target.value}))} />
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Saved So Far</div>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#64748b', fontSize:13, pointerEvents:'none' }}>$</span>
                  <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px 7px 22px', color:'#e2e8f0', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }}
                    type="number" placeholder="0" value={goalDraft.savedSoFar} onChange={e=>setGoalDraft(d=>({...d,savedSoFar:e.target.value}))} />
                </div>
              </div>
            </div>
            {/* Target date */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Target Date</div>
              <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px', color:'#e2e8f0', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none', colorScheme:'dark' }}
                type="date" value={goalDraft.targetDate} onChange={e=>setGoalDraft(d=>({...d,targetDate:e.target.value}))} />
            </div>
            {/* Buttons */}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveGoalDraft} style={{ flex:1, padding:'8px 0', borderRadius:9, background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399', fontSize:13, fontWeight:600, cursor:'pointer' }}>Save Goal</button>
              <button onClick={cancelGoalForm} style={{ padding:'8px 16px', borderRadius:9, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#64748b', fontSize:13, cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        )}
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
            { label: "Higher salary scenario", action: () => { setBSalary(P.plannerSalaryTarget); setBFood(700); setBamazon(400); setBSavings(400); setBTopup(600); setBRental(0); setBSharesMonthly(200); }, color: "#34d399" },
            { label: "Higher salary + rental income", action: () => { setBSalary(P.plannerSalaryTarget); setBFood(700); setBamazon(400); setBSavings(800); setBTopup(1000); setBRental(P.plannerRentalScenario); setBSharesMonthly(300); }, color: "#fbbf24" },
            { label: "Aggressive growth", action: () => { setBSalary(P.plannerSalaryTarget); setBFood(650); setBamazon(300); setBMisc(200); setBSavings(500); setBTopup(800); setBSharesMonthly(500); }, color: "#f97316" },
          ].map((s, i) => (
            <button key={i} onClick={s.action} style={{ padding: "10px 14px", borderRadius: 10, background: `${s.color}08`, border: `1px solid ${s.color}15`, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{s.label}</span>
            </button>
          ))}
        </div>
        <Sec icon="🎛️">Scenario B Sliders</Sec>
        <Slider label="Salary (net/mo)" value={bSalary} onChange={setBSalary} min={P.plannerSalaryMin} max={15000} step={100} color="#34d399" />
        <Slider label={`Rental income (${P.propertyShortName} weekly)`} value={bRental} onChange={setBRental} min={0} max={2500} step={50} color="#14b8a6" sub={bRental > 0 ? `$${bRental}/wk` : "None"} prefix="$" />
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
      {tab === "heatmap" && (() => {
        const hmRange = upData?.dateRange ?? (() => {
          const keys = Object.keys(dailyTotals).sort();
          if (!keys.length) return null;
          return { minDate: new Date(keys[0] + 'T00:00:00'), maxDate: new Date(keys[keys.length - 1] + 'T00:00:00') };
        })();
        if (!hmRange) return (<div style={{ textAlign: "center", padding: "60px 20px", color: "#475569" }}><div style={{ fontSize: 32, marginBottom: 12 }}>📅</div><div style={{ fontSize: 13, color: "#64748b" }}>Upload your bank CSV in Settings to see your spending heatmap.</div></div>);
        return (() => {
        const { minDate, maxDate } = hmRange;
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
          {userTier === 'free' && (
            <ProBadge title="12-Month Heatmap" description="Spot spending patterns across seasons. See which days and months cost you the most over a full year." />
          )}
          </>);
        })();
        })()}

      {/* ═══ SEARCH ═══ */}
      {tab === "search" && (() => {
        const handleRecategorise = (tx, newCat, txKey) => {
          const pattern = extractMerchantPattern(tx.desc);
          setPendingRule({ txKey, tx, cat: newCat, editPattern: pattern });
        };
        const confirmPendingRule = () => {
          if (!pendingRule) return;
          const { tx, cat, editPattern } = pendingRule;
          const count = transactions.filter(t => t.desc.toLowerCase().includes(editPattern.toLowerCase())).length;
          addUserRule(editPattern, cat);
          const isFirst = !firstRecatDone;
          if (isFirst) {
            setFirstRecatDone(true);
            localStorage.setItem('comma_first_recat_done', 'true');
          }
          setCatConfirm({ pattern: editPattern, cat, count, isFirst });
          setPendingRule(null);
          setOpenCatPicker(null);
        };
        return (
        <div onClick={() => { setOpenCatPicker(null); setPendingRule(null); }}>
          {!upData && <div style={{ padding:"6px 10px", borderRadius:8, background:"rgba(96,165,250,0.04)", border:"1px solid rgba(96,165,250,0.08)", fontSize:11, color:"#475569", marginBottom:10 }}>Showing demo transactions — upload your CSV to search your own data</div>}

          {/* Confirmation toast */}
          {catConfirm && (
            <div style={{ padding:"8px 12px", borderRadius:8, background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.2)", fontSize:12, color:"#34d399", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
              <span>✓</span>
              {catConfirm.isFirst ? (
                <span>Nice! Comma will now categorise all <strong>'{catConfirm.pattern}'</strong> transactions as <strong>{catConfirm.cat}</strong> — past and future. You can manage your rules in Settings.</span>
              ) : (
                <span>All <strong>'{catConfirm.pattern}'</strong> transactions → <strong>{catConfirm.cat}</strong>{catConfirm.count > 1 ? ` (${catConfirm.count} updated)` : ''}</span>
              )}
            </div>
          )}

          {userTier === 'free' && (
            <ProBadge title="Search 12 Months" description="Search across your full transaction history. Currently showing your latest upload only." />
          )}
          <input
            type="text" placeholder="Search transactions…" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 10 }}
          />

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {['all','amazon','paypal','restaurant','takeaway','grocery','health','transport','toll','sub'].map(cat => (
              <button key={cat} onClick={e => { e.stopPropagation(); setSearchCat(cat); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  background: searchCat === cat ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.05)",
                  color: searchCat === cat ? "#93c5fd" : "#64748b" }}>
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
            <button onClick={e => { e.stopPropagation(); setSearchCat(searchCat === 'other' ? 'all' : 'other'); }}
              style={{ padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                background: searchCat === 'other' ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.05)",
                color: searchCat === 'other' ? "#f87171" : "#64748b" }}>
              Uncategorised
            </button>
          </div>

          {/* Uncategorised helper hint */}
          {searchCat === 'other' && filteredTxs.length > 0 && Object.keys(userRules).length < 3 && (
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.08)" }}>
              Tap any category pill below to teach Comma. It'll remember for all future transactions from the same merchant.
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12, color: "#475569" }}>
            <span>{filteredTxs.length} transactions</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#f87171" }}>
              ${filteredTxs.reduce((s,t)=>s+t.amount,0).toLocaleString(undefined,{maximumFractionDigits:0})} total
            </span>
          </div>

          <div style={{ background: "rgba(255,255,255,0.015)", borderRadius: 14, border: "1px solid rgba(255,255,255,0.045)", overflow: "hidden", maxHeight: 520, overflowY: "auto" }}>
            {filteredTxs.length === 0 ? (
              <div style={{ padding: 24, textAlign: "center", color: "#475569", fontSize: 13 }}>No matching transactions</div>
            ) : filteredTxs.map((tx, i) => {
              const txKey = tx.date + tx.desc + i;
              const catColor = CAT_COLORS[tx.cat] || CAT_COLORS.other;
              const isOpen = openCatPicker === txKey;
              return (
                <div key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {/* Transaction row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                    <div style={{ fontSize: 11, color: "#475569", fontFamily: "'JetBrains Mono',monospace", flexShrink: 0, width: 82 }}>{tx.date}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.desc}</div>
                      {tx.source && (
                        <span style={{ fontSize: 9, color: tx.source === 'custom' ? '#34d399' : '#475569', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{tx.source}</span>
                      )}
                    </div>
                    {/* Clickable category pill */}
                    <button
                      onClick={e => { e.stopPropagation(); setOpenCatPicker(isOpen ? null : txKey); }}
                      title={tx.cat === 'other' || !tx.cat ? "Tap to categorise" : undefined}
                      style={{ padding: "2px 8px", borderRadius: 20, border: `1px solid ${catColor}30`, cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit", background: `${catColor}18`, color: catColor, flexShrink: 0, lineHeight: 1.6, transition: 'border-color 0.15s', outline: 'none' }}>
                      {tx.cat || 'other'}
                    </button>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: "#f87171", flexShrink: 0 }}>${tx.amount.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                  </div>

                  {/* Inline category picker */}
                  {isOpen && (
                    <div onClick={e => e.stopPropagation()} style={{ padding: "10px 14px 12px", background: "rgba(255,255,255,0.03)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      {pendingRule?.txKey === txKey ? (
                        /* ── Confirm step: editable pattern + preview ── */
                        (() => {
                          const matchCount = transactions.filter(t =>
                            t.desc.toLowerCase().includes(pendingRule.editPattern.toLowerCase())
                          ).length;
                          const catColor = CAT_COLORS[pendingRule.cat] || CAT_COLORS.other;
                          return (
                            <div>
                              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 6, fontWeight: 600, letterSpacing: "0.04em" }}>
                                CONFIRM RULE
                              </div>
                              <input
                                value={pendingRule.editPattern}
                                onChange={e => setPendingRule(prev => ({ ...prev, editPattern: e.target.value }))}
                                onClick={e => e.stopPropagation()}
                                style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)", color: "#e2e8f0", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", outline: "none", marginBottom: 8 }}
                              />
                              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 10 }}>
                                This will categorise{" "}
                                <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{matchCount} transaction{matchCount !== 1 ? "s" : ""}</span>
                                {" "}matching{" "}
                                <span style={{ color: "#94a3b8", fontFamily: "'JetBrains Mono',monospace" }}>'{pendingRule.editPattern}'</span>
                                {" "}as{" "}
                                <span style={{ color: catColor, fontWeight: 700 }}>{pendingRule.cat}</span>.
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={confirmPendingRule}
                                  disabled={!pendingRule.editPattern.trim()}
                                  style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: pendingRule.editPattern.trim() ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 700, fontFamily: "inherit", background: "rgba(52,211,153,0.2)", color: "#34d399", opacity: pendingRule.editPattern.trim() ? 1 : 0.4 }}>
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setPendingRule(null)}
                                  style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", background: "rgba(255,255,255,0.06)", color: "#64748b" }}>
                                  Back
                                </button>
                              </div>
                            </div>
                          );
                        })()
                      ) : (
                        /* ── Step 1: category picker ── */
                        <>
                          <div style={{ fontSize: 10, color: "#475569", marginBottom: 8, fontWeight: 600 }}>
                            RECATEGORISE · pattern: <span style={{ color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace" }}>{extractMerchantPattern(tx.desc)}</span>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                            {ALL_CATS.map(cat => {
                              const c = CAT_COLORS[cat] || CAT_COLORS.other;
                              const isCurrent = tx.cat === cat;
                              return (
                                <button key={cat} onClick={() => handleRecategorise(tx, cat, txKey)}
                                  style={{ padding: "3px 10px", borderRadius: 20, border: `1px solid ${isCurrent ? c : 'transparent'}`, cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit",
                                    background: isCurrent ? `${c}25` : `${c}0d`, color: isCurrent ? c : `${c}aa`, transition: 'all 0.1s', outline: 'none' }}>
                                  {cat}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}

      {/* ═══ AI CHAT FLOATING PANEL + FAB ═══ */}
      {/* Backdrop — clicking outside closes the panel */}
      {chatOpen && (
        <div
          onClick={() => setChatOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        />
      )}
      {/* Floating panel */}
      <div style={{
        position: 'fixed',
        bottom: isMobile ? 0 : 80,
        right: isMobile ? 0 : 20,
        width: isMobile ? '100vw' : 'min(400px, calc(100vw - 32px))',
        maxHeight: isMobile ? '95vh' : '70vh',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        background: '#13132a',
        borderRadius: isMobile ? '20px 20px 0 0' : 16,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
        transformOrigin: isMobile ? 'bottom center' : 'bottom right',
        transform: chatOpen ? 'scale(1) translateY(0)' : (isMobile ? 'translateY(100%)' : 'scale(0.92) translateY(16px)'),
        opacity: chatOpen ? 1 : 0,
        pointerEvents: chatOpen ? 'auto' : 'none',
        transition: 'transform 0.22s cubic-bezier(0.34,1.2,0.64,1), opacity 0.18s ease',
      }}
        onKeyDown={e => { if (e.key === 'Escape') setChatOpen(false); }}
      >
        {/* Panel header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>🤖</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>AI Insights</div>
              {aiKey && (
                <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                  {AI_PROVIDERS[aiProvider]?.label}{aiProvider && aiModel ? ' · ' : ''}{AI_PROVIDERS[aiProvider]?.models.find(m => m.id === aiModel)?.label || aiModel}
                  {isLiveData && <span style={{ marginLeft: 6, color: '#34d399' }}>● live</span>}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {chatMessages.length > 0 && (
              <button onClick={() => { setChatMessages([]); setChatSuggestions([]); }} style={{ padding: '4px 10px', borderRadius: 7, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: '#475569', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
            )}
            <button onClick={() => setChatOpen(false)} style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: 'inherit' }}>✕</button>
          </div>
        </div>
        {/* Panel body */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '12px 14px 14px' }}>
          {!aiKey ? (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: '4px 2px 8px' }}>
              {/* Heading */}
              <div style={{ textAlign: 'center', padding: '12px 8px 16px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', marginBottom: 12 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#818cf8' }}>Pro feature</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3, marginBottom: 7 }}>AI-Powered Financial Insights</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>Ask questions about your spending, get personalised advice, and spot patterns you'd miss.</div>
              </div>
              {/* Demo exchange */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: '0 2px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '82%', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.22)', fontSize: 12, color: '#c7d2fe', lineHeight: 1.6 }}>
                    What did I spend the most on last month?
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 7 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6ef7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>🤖</div>
                  <div style={{ maxWidth: '82%', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#e2e8f0', lineHeight: 1.7 }}>
                    <strong style={{ color: '#f1f5f9' }}>Groceries at $847</strong>, up 12% from the month before. The Harris Farm weekend shops are the main driver — averaging $95 per visit.
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ maxWidth: '82%', padding: '8px 12px', borderRadius: '14px 14px 4px 14px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.22)', fontSize: 12, color: '#c7d2fe', lineHeight: 1.6 }}>
                    How can I hit my house deposit goal faster?
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 7 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6ef7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>🤖</div>
                  <div style={{ maxWidth: '82%', padding: '8px 12px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, color: '#e2e8f0', lineHeight: 1.7 }}>
                    At your current savings rate of <strong style={{ color: '#f1f5f9' }}>$1,200/month</strong>, you'll reach $60K in 28 months. Cutting dining out by 30% would shave <strong style={{ color: '#34d399' }}>4 months off</strong>.
                  </div>
                </div>
              </div>
              {/* Provider note + CTA */}
              <div style={{ textAlign: 'center', padding: '0 8px 4px', marginTop: 'auto' }}>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 14, lineHeight: 1.6 }}>Works with <span style={{ color: '#94a3b8' }}>Claude</span>, <span style={{ color: '#94a3b8' }}>ChatGPT</span>, or <span style={{ color: '#94a3b8' }}>Gemini</span> — bring your own API key.</div>
                <button
                  onClick={() => { setChatOpen(false); setTab('settings'); }}
                  style={{ width: '100%', padding: '11px 20px', borderRadius: 12, background: 'linear-gradient(135deg, rgba(79,110,247,0.25) 0%, rgba(124,58,237,0.25) 100%)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.01em', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(79,110,247,0.38) 0%, rgba(124,58,237,0.38) 100%)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, rgba(79,110,247,0.25) 0%, rgba(124,58,237,0.25) 100%)'}
                >Set up AI in Settings →</button>
              </div>
            </div>
          ) : (<>
            {/* Quick action pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, flexShrink: 0 }}>
              {[
                { label: '📊 Summarise my month', prompt: 'Give me a concise monthly summary of my finances. Include: total income, total spending, savings rate, top 3 spending categories, and one thing I should consider changing.' },
                { label: '🏠 Cost of living check', prompt: 'Compare my spending to typical Australian benchmarks. Am I above or below average on groceries, dining, transport, and utilities? Use ABS data as a rough guide.' },
              ].map(({ label, prompt }) => (
                <button key={label} onClick={() => sendChatMessage(prompt)} disabled={chatStreaming}
                  style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 10, cursor: chatStreaming ? 'default' : 'pointer', opacity: chatStreaming ? 0.5 : 1, fontWeight: 500, whiteSpace: 'nowrap', fontFamily: 'inherit' }}
                  onMouseEnter={e => { if (!chatStreaming) e.currentTarget.style.background = 'rgba(99,102,241,0.16)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                >{label}</button>
              ))}
            </div>
            {/* Message area */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2 }}>
              {chatMessages.length === 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <div style={{ fontSize: 28, opacity: 0.4 }}>💬</div>
                  <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 240, lineHeight: 1.7, opacity: 0.7 }}>Ask anything about your finances — spending patterns, saving tips, mortgage analysis, budget advice.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
                    {[
                      'What did I spend the most on last month?',
                      'How can I improve my savings rate?',
                      'Are there any spending patterns I should worry about?',
                    ].map(prompt => (
                      <button key={prompt} onClick={() => sendChatMessage(prompt)} style={{ padding: '9px 13px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 12, cursor: 'pointer', textAlign: 'left', lineHeight: 1.4, transition: 'background 0.15s', fontFamily: 'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      >{prompt}</button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => {
                const isLastAssistant = msg.role === 'assistant' && i === chatMessages.length - 1 && !chatStreaming;
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '85%', padding: '9px 13px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: msg.role === 'user' ? 'rgba(99,102,241,0.18)' : msg.isError ? 'rgba(248,113,113,0.07)' : 'rgba(255,255,255,0.055)',
                        border: msg.role === 'user' ? '1px solid rgba(99,102,241,0.25)' : msg.isError ? '1px solid rgba(248,113,113,0.18)' : '1px solid rgba(255,255,255,0.07)',
                        fontSize: 12, color: msg.isError ? '#fca5a5' : '#e2e8f0', lineHeight: 1.75,
                      }}>
                        {msg.role === 'assistant' ? (<>
                          {(() => {
                            const parts = msg.text.split('\n');
                            return parts.map((line, li) => {
                              const isBullet = /^[-*•]\s/.test(line);
                              const isNum = /^\d+\.\s/.test(line);
                              let formatted = line
                                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                                .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
                              CHAT_CATEGORY_LINKS.forEach(({ pattern, tab: targetTab }) => {
                                formatted = formatted.replace(pattern, (match) =>
                                  `<button onclick="window.__chatNav('${targetTab}')" style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#a5b4fc;border-radius:4px;padding:0 5px;font-size:11px;cursor:pointer;font-family:inherit;line-height:1.6">${match}</button>`
                                );
                              });
                              return (
                                <div key={li} style={{ marginLeft: (isBullet || isNum) ? 8 : 0, paddingLeft: (isBullet || isNum) ? 8 : 0, borderLeft: (isBullet || isNum) ? '2px solid rgba(255,255,255,0.1)' : 'none', marginBottom: line === '' ? 6 : 2 }}
                                  dangerouslySetInnerHTML={{ __html: formatted || '&nbsp;' }}
                                />
                              );
                            });
                          })()}
                          {msg.action && <button onClick={() => setTab(msg.action.tab)} style={{ marginTop: 8, padding: '5px 10px', borderRadius: 7, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5', fontSize: 11, cursor: 'pointer', display: 'block', fontFamily: 'inherit' }}>{msg.action.label}</button>}
                        </>) : msg.text}
                      </div>
                    </div>
                    {isLastAssistant && chatSuggestions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: 4 }}>
                        {chatSuggestions.map(s => (
                          <button key={s} onClick={() => { setChatSuggestions([]); sendChatMessage(s); }}
                            style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', transition: 'background 0.15s', fontFamily: 'inherit' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                          >{s}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {chatStreaming && chatMessages[chatMessages.length - 1]?.role !== 'assistant' && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ padding: '10px 14px', borderRadius: '14px 14px 14px 4px', background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                      {[0,1,2].map(j => <span key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: '#64748b', animation: 'chatDot 1.2s infinite', animationDelay: `${j * 0.2}s`, display: 'inline-block' }} />)}
                    </span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
            {/* Input area */}
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                disabled={chatStreaming}
                placeholder="Ask about your finances…"
                rows={1}
                style={{
                  flex: 1, resize: 'none', maxHeight: 80, overflowY: 'auto',
                  padding: '10px 13px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0', fontSize: 12, lineHeight: 1.5,
                  outline: 'none', fontFamily: 'inherit',
                  opacity: chatStreaming ? 0.5 : 1,
                }}
              />
              <button
                onClick={sendChatMessage}
                disabled={chatStreaming || !chatInput.trim()}
                style={{
                  padding: '10px 14px', borderRadius: 12, flexShrink: 0,
                  background: chatStreaming || !chatInput.trim() ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.25)',
                  border: '1px solid rgba(99,102,241,0.3)', color: chatStreaming || !chatInput.trim() ? '#475569' : '#818cf8',
                  fontSize: 16, cursor: chatStreaming || !chatInput.trim() ? 'default' : 'pointer', lineHeight: 1, fontFamily: 'inherit',
                }}
              >↑</button>
            </div>
          </>)}
        </div>
      </div>
      {/* FAB */}
      <button
        onClick={() => { setChatOpen(o => !o); setChatHasUnread(false); }}
        title="AI Insights"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: isMobile ? 44 : 52,
          height: isMobile ? 44 : 52,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #4f6ef7 0%, #7c3aed 100%)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isMobile ? 20 : 22,
          boxShadow: '0 4px 20px rgba(79,110,247,0.45), 0 2px 8px rgba(0,0,0,0.4)',
          zIndex: 201,
          animation: fabPulsed ? 'none' : 'fabPulse 1.8s ease-in-out 2',
          transition: 'transform 0.15s, box-shadow 0.15s',
          outline: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(79,110,247,0.6), 0 2px 8px rgba(0,0,0,0.4)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(79,110,247,0.45), 0 2px 8px rgba(0,0,0,0.4)'; }}
      >
        🤖
        {/* No-API-key indicator */}
        {!aiKey && (
          <span style={{ position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', border: '2px solid #0b0b17' }} />
        )}
        {/* Unread indicator */}
        {chatHasUnread && aiKey && (
          <span style={{ position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: '50%', background: '#34d399', border: '2px solid #0b0b17' }} />
        )}
      </button>

      {/* ═══ SETTINGS ═══ */}
      {tab === "settings" && (<div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDropActive(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDropActive(false); }}
          onDrop={e => { e.preventDefault(); setDropActive(false); handleUploadedFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dropActive ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 16,
            padding: '48px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dropActive ? 'rgba(96,165,250,0.04)' : 'rgba(255,255,255,0.01)',
            transition: 'border-color 0.2s, background 0.2s',
            marginBottom: 20,
            userSelect: 'none',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            multiple
            style={{ display: 'none' }}
            onChange={e => { handleUploadedFiles(e.target.files); e.target.value = ''; }}
          />
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.25 }}>⬆</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 6 }}>Drop your bank CSV files here</div>
          <div style={{ fontSize: 12, color: '#475569' }}>or click to browse</div>
          <div style={{ marginTop: 14, fontSize: 10, color: '#334155', lineHeight: 1.9 }}>
            Up Bank · CommSec · PayPal · CBA · ANZ · NAB · Westpac · BankWest · Macquarie · St.George
          </div>
        </div>

        {/* Per-file status chips */}
        {uploadedFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {uploadedFiles.map(f => {
              const isSuccess = f.status === 'success';
              const isManual  = f.status === 'manual';
              const accent    = isSuccess ? '#34d399' : isManual ? '#fbbf24' : '#f87171';
              const icon      = isSuccess ? '✓' : isManual ? '⚠' : '✕';
              const label     = isSuccess
                ? `${f.bankLabel} — ${f.rowCount.toLocaleString()} ${f.dateRange ? 'transactions' : 'holdings'} loaded`
                : isManual
                  ? `${f.bankLabel} — unknown format, tap to map columns`
                  : `Could not parse ${f.filename}`;
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: `${accent}08`, border: `1px solid ${accent}18`, cursor: isManual ? 'pointer' : 'default' }}
                  onClick={isManual ? () => setMappingFileId(f.id) : undefined}
                >
                  <span style={{ color: accent, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontSize: 12, color: '#cbd5e1', flex: 1 }}>{label}</span>
                  <button
                    onClick={e => { e.stopPropagation(); setUploadedFiles(prev => prev.filter(x => x.id !== f.id)); }}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                    title="Remove"
                  >✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* Loaded sources summary */}
        {uploadedFiles.filter(f => f.status === 'success').length > 0 && (
          <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 10 }}>Loaded data sources</div>
            {uploadedFiles.filter(f => f.status === 'success').map((f, i, arr) => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{f.bankLabel}</div>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                    {f.dateRange
                      ? `${f.rowCount.toLocaleString()} transactions · ${f.dateRange.start} – ${f.dateRange.end}`
                      : `${f.rowCount} holdings`}
                  </div>
                </div>
                <button
                  onClick={() => setUploadedFiles(prev => prev.filter(x => x.id !== f.id))}
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, color: '#64748b', cursor: 'pointer', fontSize: 11, padding: '4px 10px', fontFamily: 'inherit' }}
                >✕ Remove</button>
              </div>
            ))}
          </div>
        )}

        {/* Demo mode notice */}
        {uploadedFiles.filter(f => f.status === 'success').length === 0 && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(96,165,250,0.04)', border: '1px solid rgba(96,165,250,0.08)', fontSize: 12, color: '#64748b', lineHeight: 1.7, marginBottom: 20 }}>
            Showing demo data. Upload your own CSV files above to see your real figures.
          </div>
        )}

        {/* Clear all data */}
        {uploadedFiles.length > 0 && (
          <button
            onClick={() => {
              if (confirmClear) { setUploadedFiles([]); setConfirmClear(false); }
              else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 4000); }
            }}
            style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: `1px solid ${confirmClear ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.05)'}`, cursor: 'pointer', background: confirmClear ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.02)', color: confirmClear ? '#f87171' : '#64748b', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.2s' }}
          >
            {confirmClear ? 'Tap again to confirm — this clears all data' : 'Clear all data'}
          </button>
        )}

        {/* ── Encrypted Sync teaser ── */}
        {userTier === 'free' && (
          <div style={{ marginTop: 24 }}>
            <ProBadge
              title="Encrypted Cloud Sync"
              description="Your data is currently stored in this browser only. Clear your cache and it's gone. Pro gives you AES-256-GCM encrypted sync across all your devices — we can't read your data even if we wanted to."
              cta={{ label: 'Learn about our encryption', onClick: () => window.open('https://getcomma.com.au/help', '_blank') }}
            />
          </div>
        )}

        {/* ── Custom Categories / User Rules ── */}
        <div style={{ marginTop: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Custom Categories</div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>Rules you've created to categorise merchants Comma doesn't recognise. These stay on your device.</div>
          </div>

          {/* Rule list */}
          {Object.keys(userRules).length === 0 ? (
            <div style={{ padding: '14px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: '#475569', lineHeight: 1.7 }}>
              No custom rules yet. Tap any transaction's category in the Search tab to create one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {Object.entries(userRules).map(([pattern, category]) => {
                const catColor = CAT_COLORS[category] || CAT_COLORS.other;
                const matchCount = transactions.filter(tx =>
                  tx.desc.toLowerCase().includes(pattern.toLowerCase())
                ).length;
                return (
                  <div key={pattern} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ fontSize: 12, color: '#cbd5e1', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pattern}</span>
                    <span style={{ fontSize: 12, color: '#475569', flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: `${catColor}18`, color: catColor, flexShrink: 0 }}>{category}</span>
                    {matchCount > 0 && (
                      <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>{matchCount} tx</span>
                    )}
                    <button
                      onClick={() => deleteUserRule(pattern)}
                      style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                      title="Delete rule"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Export / Import buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: Object.keys(userRules).length > 0 ? 0 : 12 }}>
            <button
              onClick={() => {
                const json = JSON.stringify(userRules, null, 2);
                navigator.clipboard.writeText(json).then(() => {
                  setImportRulesStatus({ ok: true, msg: 'Rules copied to clipboard' });
                  setTimeout(() => setImportRulesStatus(null), 3000);
                });
              }}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
            >Export Rules</button>
            <button
              onClick={() => { setShowImportRules(v => !v); setImportRulesText(''); setImportRulesStatus(null); }}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', color: '#94a3b8', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
            >Import Rules</button>
          </div>

          {/* Import panel */}
          {showImportRules && (
            <div style={{ marginTop: 10 }}>
              <textarea
                value={importRulesText}
                onChange={e => setImportRulesText(e.target.value)}
                placeholder={'Paste exported rules JSON here…\n{\n  "MERCHANT NAME": "category",\n  …\n}'}
                rows={6}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', color: '#cbd5e1', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.6 }}
              />
              <button
                onClick={() => {
                  try {
                    const incoming = JSON.parse(importRulesText);
                    if (typeof incoming !== 'object' || Array.isArray(incoming)) throw new Error('Expected a JSON object');
                    const added = Object.entries(incoming).filter(([k]) => !(k in userRules)).length;
                    setUserRules(prev => ({ ...incoming, ...prev })); // existing rules win on conflict
                    setImportRulesStatus({ ok: true, msg: `Imported ${added} new rule${added !== 1 ? 's' : ''} (${Object.keys(incoming).length - added} skipped — already exist)` });
                    setImportRulesText('');
                    setShowImportRules(false);
                  } catch (err) {
                    setImportRulesStatus({ ok: false, msg: `Invalid JSON: ${err.message}` });
                  }
                }}
                style={{ marginTop: 8, width: '100%', padding: '9px 0', borderRadius: 9, border: '1px solid rgba(96,165,250,0.25)', cursor: 'pointer', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
              >Apply Import</button>
            </div>
          )}

          {/* Status feedback */}
          {importRulesStatus && (
            <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, background: importRulesStatus.ok ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${importRulesStatus.ok ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`, fontSize: 12, color: importRulesStatus.ok ? '#34d399' : '#f87171' }}>
              {importRulesStatus.msg}
            </div>
          )}
        </div>

        {/* ── AI Insights ── */}
        <div style={{ marginTop: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>AI Insights</div>
            <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.6 }}>Connect your own AI to get personalised financial insights. Your data goes direct from your browser to your AI provider — Comma is never in the loop.</div>
          </div>

          {/* Provider selector */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {Object.entries(AI_PROVIDERS).map(([key, prov]) => {
              const active = aiProvider === key;
              return (
                <button
                  key={key}
                  onClick={() => saveAiConfig({ provider: key, model: prov.models[0].id })}
                  style={{ flex: 1, padding: '12px 8px', borderRadius: 10, border: `1.5px solid ${active ? prov.accent : 'rgba(255,255,255,0.07)'}`, background: active ? `${prov.accent}18` : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', fontFamily: 'inherit' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${active ? prov.accent : '#475569'}`, background: active ? prov.accent : 'transparent', flexShrink: 0, transition: 'all 0.15s' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? prov.accent : '#94a3b8' }}>{prov.label}</span>
                  </div>
                  <div style={{ fontSize: 10, color: active ? `${prov.accent}cc` : '#475569' }}>{prov.sub}</div>
                </button>
              );
            })}
          </div>

          {/* API key input */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>API Key</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={aiKey}
                  onChange={e => saveAiConfig({ apiKey: e.target.value })}
                  placeholder={AI_PROVIDERS[aiProvider].placeholder}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 36px 9px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', color: '#cbd5e1', fontSize: 12, fontFamily: 'monospace', outline: 'none' }}
                />
                <button
                  onClick={() => setShowApiKey(v => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 13, padding: 2, lineHeight: 1 }}
                  title={showApiKey ? 'Hide key' : 'Show key'}
                >{showApiKey ? '🙈' : '👁'}</button>
              </div>
              <button
                onClick={testAiConnection}
                disabled={!aiKey || aiTesting}
                style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${AI_PROVIDERS[aiProvider].accent}44`, background: `${AI_PROVIDERS[aiProvider].accent}12`, color: !aiKey ? '#475569' : AI_PROVIDERS[aiProvider].accent, fontSize: 12, fontWeight: 600, cursor: !aiKey || aiTesting ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', opacity: !aiKey ? 0.5 : 1 }}
              >{aiTesting ? 'Testing…' : 'Test'}</button>
            </div>
            {aiTestStatus && (
              <div style={{ marginTop: 6, fontSize: 11, color: aiTestStatus.ok ? '#34d399' : '#f87171' }}>{aiTestStatus.msg}</div>
            )}
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>Model</div>
            <select
              value={aiModel}
              onChange={e => saveAiConfig({ model: e.target.value })}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)', color: '#cbd5e1', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
            >
              {AI_PROVIDERS[aiProvider].models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Privacy note */}
          <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
            Your API key is stored in your browser only. When you ask a question, your financial data and question go directly from your browser to {AI_PROVIDERS[aiProvider].label}. Comma never sees the request, the response, or your key.
          </div>
        </div>

      </div>)}

      <div style={{ marginTop: 32, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.03)", textAlign: "center" }}><div style={{ color: "#1e293b", fontSize: 9 }}>Up Bank + PayPal + Gateway + CommSec</div></div>
      </div>{/* end main content */}

      {/* ═══ COLUMN MAPPING MODAL ═══ */}
      {mappingFileId && (() => {
        const file = uploadedFiles.find(f => f.id === mappingFileId);
        return file ? (
          <ColumnMappingModal
            file={file}
            onClose={() => setMappingFileId(null)}
            onSuccess={data => handleMappingSuccess(mappingFileId, data)}
          />
        ) : null;
      })()}
    </div>
  );
}

// ─── PIN GATE ─────────────────────────────────────────────────────────────────
// TODO: Replace with proper authentication (Supabase Auth in Week 2)
// For now, bypass PIN check — demo mode doesn't need it

export default function Dashboard() {
  return <DashboardInner />;
}
