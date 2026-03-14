import React, { useState, useMemo, useEffect, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line, ReferenceLine, AreaChart, Area, Cell, LineChart, ReferenceDot } from "recharts";
import { processCSVText, parseCSV, processUniversalBank, applyUserRules, aggregateTxs, extractMerchantPattern, sanitiseUserInput, sanitiseCSVField } from "./dataLoader.js";
import { streamChat, buildFinancialContext } from "./aiProvider.js";
import { getProCheckoutUrl, getLifetimeCheckoutUrl } from "./checkout.js";
import { supabase, signUp as supaSignUp, signIn as supaSignIn, signOut as supaSignOut, getUser, onAuthStateChange, getVault, createVault, loadAllEncryptedData, saveEncryptedData, getUserTier } from "./supabase.js";
import { generateSalt, saltToBase64, base64ToSalt, encryptData, decryptData, deriveKey, encrypt, decrypt } from "./encryption.js";

// ─── ENCRYPTION KEY CACHE ─────────────────────────────────────────────────────
// Stored at module level so they survive re-renders but are wiped on tab close.
// Never persisted to localStorage or any other storage.
let _encKey  = null; // CryptoKey (AES-256-GCM) — null until user logs in
let _encSalt = null; // Uint8Array — vault salt, needed to encrypt new blobs

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
const St=({label,value,sub,accent="#60a5fa",small})=>(<div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:small?"12px 16px":"16px 24px",flex:1,minWidth:small?85:115,boxShadow:"0 2px 12px rgba(0,0,0,0.3)"}}><div style={{color:"#6b7290",fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:4,fontFamily:"'DM Sans',sans-serif"}}>{label}</div><div style={{color:accent,fontSize:small?15:24,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",lineHeight:1.1,fontVariantNumeric:"tabular-nums"}}>{value}</div>{sub&&<div style={{color:"#6b7290",fontSize:11,marginTop:3,fontFamily:"'DM Sans',sans-serif"}}>{sub}</div>}</div>);
const Sec=({children,icon})=>(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,marginTop:24}}><span style={{fontSize:15}}>{icon}</span><h2 style={{margin:0,fontSize:12,fontWeight:700,color:"#6b7290",textTransform:"uppercase",letterSpacing:"0.1em",fontFamily:"'DM Sans',sans-serif"}}>{children}</h2><div style={{flex:1,height:1,background:"linear-gradient(90deg,rgba(255,255,255,0.07),transparent)"}}/></div>);
const Ch=({children,height})=>(<div style={{background:"rgba(255,255,255,0.015)",borderRadius:14,border:"1px solid rgba(255,255,255,0.045)",padding:"12px 6px 6px"}}><ResponsiveContainer width="100%" height={height||200}>{children}</ResponsiveContainer></div>);
const Lg=({items})=>(<div style={{display:"flex",justifyContent:"center",gap:11,padding:"5px 0",fontSize:11,flexWrap:"wrap"}}>{items.map(([l,c])=>(<div key={l} style={{display:"flex",alignItems:"center",gap:3,color:"#94a3b8"}}><div style={{width:5,height:5,borderRadius:2,background:c}}/>{l}</div>))}</div>);
const Note=({color,children})=>(<div style={{marginTop:7,padding:9,borderRadius:8,background:`${color}08`,border:`1px solid ${color}15`,fontSize:12,color:"#94a3b8",lineHeight:1.5}}>{children}</div>);
const Row=({label,value,color,bold,note,borderTop})=>(<div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:bold?"8px 0":"4px 0",borderTop:borderTop?"1px solid rgba(255,255,255,0.06)":"none",marginTop:borderTop?4:0}}><span style={{fontSize:13,color:bold?"#e2e8f0":"#94a3b8",fontWeight:bold?700:400}}>{label}{note&&<span style={{fontSize:10,color:"#475569",marginLeft:6}}>{note}</span>}</span><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:bold?15:13,fontWeight:bold?700:600,color:color||"#cbd5e1"}}>{value}</span></div>);
const Badge=({text,color})=>(<span style={{fontSize:9,padding:"2px 7px",borderRadius:20,fontWeight:700,background:`${color}15`,color,whiteSpace:"nowrap"}}>{text}</span>);

// ─── CURRENCY VALUE ──────────────────────────────────────────────────────────
// Bloomberg-style: dollar sign muted, number carries semantic colour
const CurrencyVal=({value,size=24,color})=>{
  const abs=Math.abs(value);const isNeg=value<0;
  const numColor=color||(isNeg?'#f5455c':'#eef0f6');
  return(
    <span className={abs>=10000?'breathe-spacing':undefined} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:size,fontWeight:700,fontVariantNumeric:"tabular-nums",lineHeight:1.1}}>
      <span style={{fontSize:'0.8em',color:'#8b95b8'}}>{isNeg?'-$':'$'}</span>
      <span style={{color:numColor}}>{abs.toLocaleString()}</span>
    </span>
  );
};

// ─── PERCENTAGE CHANGE ───────────────────────────────────────────────────────
// Animated arrow + coloured value
const PctChange=({value})=>{
  const isPos=value>=0;
  const color=isPos?'#22c98a':'#f5455c';
  return(
    <span style={{color,fontVariantNumeric:"tabular-nums"}}>
      <span className={isPos?'arrow-up':'arrow-down'} style={{fontSize:'0.85em',display:'inline-block'}}>{isPos?'↑':'↓'}</span>
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

// ─── PRO BADGE ────────────────────────────────────────────────────────────────
const ProBadge = ({ feature, message, isSignedIn, onUpgrade, onSignIn }) => (
  <div style={{ margin:'12px 0', padding:'20px 16px', borderRadius:14, background:'rgba(251,191,36,0.04)', border:'1px solid rgba(251,191,36,0.12)', textAlign:'center' }}>
    <div style={{ fontSize:22, marginBottom:8 }}>✨</div>
    <div style={{ fontSize:13, color:'#fbbf24', fontWeight:700, marginBottom:5 }}>{feature}</div>
    <div style={{ fontSize:11, color:'#64748b', marginBottom:12, lineHeight:1.55 }}>
      {message || 'Available on Pro — unlock with a subscription'}
    </div>
    {!isSignedIn && (
      <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10 }}>Create a free account first to purchase.</div>
    )}
    <button onClick={isSignedIn ? onUpgrade : onSignIn} style={{ padding:'7px 20px', borderRadius:8, background:'rgba(99,102,241,0.15)', border:'1px solid rgba(99,102,241,0.3)', color:'#818cf8', fontSize:12, fontWeight:600, cursor:'pointer' }}>
      {isSignedIn ? 'Upgrade to Pro →' : 'Create account →'}
    </button>
    <div style={{ marginTop:10 }}>
      <button onClick={onUpgrade} style={{ background:'none', border:'none', color:'#475569', fontSize:10, cursor:'pointer', textDecoration:'underline' }}>See all plans</button>
    </div>
  </div>
);

// ─── UPGRADE MODAL ────────────────────────────────────────────────────────────
const UpgradeModal = ({ onClose, userTier, authUser }) => {
  const signedIn = !!authUser;

  const handleBuyPro = () => {
    if (!signedIn) return;
    window.open(getProCheckoutUrl(authUser.id, authUser.email), '_blank');
  };

  const handleBuyLifetime = () => {
    if (!signedIn) return;
    window.open(getLifetimeCheckoutUrl(authUser.id, authUser.email), '_blank');
  };

  const notSignedInNote = (
    <div style={{ marginTop:8, fontSize:11, color:'#64748b', textAlign:'center' }}>
      <span style={{ color:'#94a3b8' }}>Create a free account first to purchase.</span>
    </div>
  );

  // Lifetime users have everything — no purchase buttons
  if (userTier === 'lifetime') {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ background:'#0f1123', border:'1px solid rgba(255,255,255,0.09)', borderRadius:20, padding:32, maxWidth:360, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:38, marginBottom:10 }}>🎉</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#e2e8f0', marginBottom:8 }}>You're on Lifetime</div>
          <div style={{ fontSize:13, color:'#64748b', lineHeight:1.65, marginBottom:24 }}>You have everything — thanks for your support!</div>
          <button onClick={onClose} style={{ padding:'10px 20px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#64748b', fontSize:12, cursor:'pointer' }}>
            Close
          </button>
        </div>
      </div>
    );
  }

  // Pro users — upsell to Lifetime
  if (userTier === 'pro') {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ background:'#0f1123', border:'1px solid rgba(255,255,255,0.09)', borderRadius:20, padding:32, maxWidth:360, width:'100%' }}>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:38, marginBottom:10 }}>⭐</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#e2e8f0', marginBottom:6 }}>You're already on Pro</div>
            <div style={{ fontSize:12, color:'#64748b', lineHeight:1.65 }}>Upgrade to Lifetime for a one-time payment and never pay again.</div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <button
              onClick={handleBuyLifetime}
              disabled={!signedIn}
              style={{ padding:'13px 14px', borderRadius:12, background: signedIn ? 'rgba(251,191,36,0.12)' : 'rgba(251,191,36,0.05)', border:'1px solid rgba(251,191,36,0.28)', color: signedIn ? '#fbbf24' : '#92400e', fontSize:13, fontWeight:700, cursor: signedIn ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}
            >
              Buy Lifetime →
            </button>
            {!signedIn && notSignedInNote}
            <button onClick={onClose} style={{ padding:'10px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#64748b', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
              Maybe later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Free users — show full upgrade pitch
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background:'#0f1123', border:'1px solid rgba(255,255,255,0.09)', borderRadius:20, padding:32, maxWidth:360, width:'100%' }}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:38, marginBottom:10 }}>✨</div>
          <div style={{ fontSize:20, fontWeight:800, color:'#e2e8f0', marginBottom:6 }}>Upgrade to Pro</div>
          <div style={{ fontSize:12, color:'#64748b', lineHeight:1.65 }}>Unlock the full Comma experience with 12 months of history and AI-powered insights.</div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:1, marginBottom:20 }}>
          {[
            ['📅', '12 months of transaction history'],
            ['📈', 'Net worth timeline & trend tracking'],
            ['🎯', 'Goal projections & completion dates'],
            ['🤖', 'AI financial chat assistant'],
            ['📉', 'Advanced trend analysis'],
            ['🔍', 'Full search & heatmap history'],
          ].map(([icon, text]) => (
            <div key={text} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 4px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize:15, flexShrink:0 }}>{icon}</span>
              <span style={{ fontSize:12, color:'#94a3b8' }}>{text}</span>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          <button
            onClick={handleBuyPro}
            disabled={!signedIn}
            style={{ padding:'13px 14px', borderRadius:12, background: signedIn ? 'rgba(251,191,36,0.12)' : 'rgba(251,191,36,0.05)', border:'1px solid rgba(251,191,36,0.28)', color: signedIn ? '#fbbf24' : '#92400e', fontSize:13, fontWeight:700, cursor: signedIn ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}
          >
            Buy Pro →
          </button>
          {!signedIn && notSignedInNote}
          <button onClick={onClose} style={{ padding:'10px', borderRadius:10, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', color:'#64748b', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

const CAT_COLORS={grocery:'#34d399',restaurant:'#fb923c',takeaway:'#f97316',coffee:'#a78bfa',delivery:'#60a5fa',alcohol:'#f59e0b',transport:'#38bdf8',fuel:'#facc15',toll:'#94a3b8',parking:'#78716c',car:'#64748b',utilities:'#a8a29e',telco:'#6ee7b7',insurance:'#93c5fd',sub:'#c084fc',health:'#f472b6',fitness:'#86efac',personal_care:'#e879f9',education:'#67e8f9',school:'#22d3ee',childcare:'#f9a8d4',clothing:'#fca5a5',home:'#fde68a',kids:'#bef264',gifts:'#fb923c',bnpl:'#a3e635',charity:'#4ade80',strata:'#94a3b8',pets:'#bbf7d0',travel:'#7dd3fc',gambling:'#fb7185',government:'#94a3b8',cash:'#9ca3af',mortgage:'#94a3b8',rent:'#94a3b8',amazon:'#f97316',paypal:'#3b82f6',shopping:'#e879f9',personal:'#475569',other:'#475569',grocery_delivery:'#6ee7b7'};
const ALL_CATS=['grocery','restaurant','takeaway','coffee','delivery','alcohol','transport','fuel','toll','parking','car','home','utilities','telco','insurance','health','fitness','personal_care','clothing','education','school','childcare','kids','sub','bnpl','gifts','charity','strata','travel','gambling','cash','government','mortgage','rent','transfer','other'];

const DEFAULT_PREFERENCES = { hiddenCategories: ['gambling'], showGambling: false, showCents: false, weekStart: 'monday' };

// ─── GOAL CONFETTI ───────────────────────────────────────────────────────────
// CSS-only confetti burst when a goal hits 100%. Triggers once per goal (localStorage flag).
const CONFETTI_COLORS = ['#6366f1','#a78bfa','#34d399','#60a5fa','#fbbf24','#f472b6'];
function GoalConfetti({ goalId }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const key = `comma_confetti_${goalId}`;
    try {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        setShow(true);
        setTimeout(() => setShow(false), 700);
      }
    } catch {}
  }, [goalId]);
  if (!show) return null;
  return (
    <div style={{ position: 'absolute', top: 0, left: '50%', pointerEvents: 'none', zIndex: 10 }}>
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', width: 5, height: 5, borderRadius: 1,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animation: `confetti${i % 12} 600ms ease-out both`,
          animationDelay: `${i * 30}ms`,
          left: `${(i - 6) * 12}px`,
        }} />
      ))}
    </div>
  );
}

// ─── GOAL PROGRESS BAR ───────────────────────────────────────────────────────
// Animates from 0 → target on first render; colour shifts toward green past 80%.
function GoalProgressBar({ pct, height = 8, radius = 4 }) {
  const barRef     = useRef(null);
  const animRef    = useRef(false);
  const target     = Math.min(pct, 100);
  const isNearGoal = target >= 80;
  // Shift toward green when approaching goal — signals progress feels rewarding
  const barBg      = isNearGoal
    ? 'linear-gradient(90deg, #4f6ef7, #34a8a0)'
    : '#4f6ef7';

  useEffect(() => {
    if (animRef.current || !barRef.current || target === 0) return;
    animRef.current = true;
    barRef.current.style.width = '0%';
    requestAnimationFrame(() => {
      if (!barRef.current) return;
      barRef.current.style.transition = `width 600ms cubic-bezier(0.4,0,0.2,1)`;
      barRef.current.style.width = `${target}%`;
      // Bounce at end of fill
      setTimeout(() => {
        if (!barRef.current) return;
        barRef.current.style.animation = 'barBounce 220ms ease-out both';
        barRef.current.style.transformOrigin = 'center';
      }, 600);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ flex: 1, height, borderRadius: radius, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
      <div ref={barRef} style={{ width: `${target}%`, height: '100%', borderRadius: radius, background: barBg }} />
    </div>
  );
}


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
  {label:"Summary",  icon:"📊", tabs:[{id:"overview",l:"📊 Overview"},{id:"planner",l:"🎛️ Planner"}]},
  {label:"Assets",   icon:"💰", tabs:[{id:"networth",l:"💰 Net Worth"},{id:"property",l:"🏠 Property"}]},
  {label:"Spending", icon:"🛒", tabs:[{id:"committed",l:"📌 Committed"},{id:"categories",l:"🛒 Categories"},{id:"health",l:"💊 Health"},{id:"subscriptions",l:"📱 Subscriptions"},{id:"savings",l:"🏦 Savings"}]},
  {label:"Insights", icon:"💡", tabs:[{id:"insights",l:"💡 Insights"},{id:"deep",l:"🔬 Deep Dive"},{id:"trend",l:"📉 Trend"},{id:"heatmap",l:"📅 Heatmap"},{id:"search",l:"🔍 Search"}]},
  {label:"Planning", icon:"🎯", tabs:[{id:"goals",l:"🎯 Goals"},{id:"tax",l:"💸 Tax"},{id:"compare",l:"⚖️ Compare"},{id:"growth",l:"🌱 Growth"}]},
  {label:"System",   icon:"⚙️", tabs:[{id:"settings",l:"⚙️ Settings"}]},
];

function getTimeOfDay() {
  const now = new Date();
  const h = now.getHours();
  const dow = now.getDay(); // 0=Sun, 6=Sat
  const dom = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const mn = monthNames[now.getMonth()];
  const period = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night';
  // Date-aware overrides (highest priority)
  if (dom === 1) return { greeting: `Welcome to ${mn}`, period };
  if (dom === daysInMonth) return { greeting: `Last day of ${mn}`, period };
  if (dow === 6 || dow === 0 || (dow === 5 && h >= 17)) return { greeting: 'Happy weekend', period };
  // Time-of-day
  if (period === 'morning') return { greeting: 'Good morning', period };
  if (period === 'afternoon') return { greeting: 'Good afternoon', period };
  if (period === 'evening') return { greeting: 'Good evening', period };
  return { greeting: 'Burning the midnight oil', period: 'night' };
}

// ─── COMMA SPARK ──────────────────────────────────────────────────────────────
// Reusable sparkline terminating in the Comma brand glyph.
// data: [{day:'YYYY-MM-DD', cumNet:number}], collapsed: bool
// ─── COUNT-UP COMPONENT ──────────────────────────────────────────────────────
// Animates a number from 0 → end on first mount only, ease-out cubic.
// Skips animation if value is 0 or element is below fold.
function CountUp({ end, duration = 500, prefix = '', suffix = '', decimals = 0, color }) {
  const [display, setDisplay] = useState(end);
  const mountedRef = useRef(false);
  const frameRef   = useRef(null);
  const spanRef    = useRef(null);

  useEffect(() => {
    if (mountedRef.current || !end) return;
    // Skip if below viewport fold
    if (spanRef.current) {
      const rect = spanRef.current.getBoundingClientRect();
      if (rect.top > window.innerHeight) return;
    }
    mountedRef.current = true;
    const startTs = { current: null };
    const animate = (ts) => {
      if (!startTs.current) startTs.current = ts;
      const elapsed  = ts - startTs.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const cur      = end * eased;
      setDisplay(cur);
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
      else setDisplay(end);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formatted = decimals > 0
    ? Math.abs(display).toFixed(decimals)
    : Math.round(Math.abs(display)).toLocaleString();
  const sign = end < 0 ? '-' : '';
  const style = color ? { color } : {};
  return <span ref={spanRef} style={style}>{sign}{prefix}{formatted}{suffix}</span>;
}

export function CommaSpark({ data, collapsed, todaySpent = 0, todayNet = 0, daysInMonth = 30, isAboveAvgPace = false, drawDuration = 800, upgradeFlash = false }) {
  const [hovered, setHovered] = useState(false);
  const sparkPathRef = useRef(null);
  const drawnRef     = useRef(false);
  const hasData = data && data.length > 1;
  const lastCumNet = hasData ? data[data.length - 1].cumNet : 0;
  const color = upgradeFlash ? '#a78bfa' : (hasData ? (lastCumNet >= 0 ? '#22c98a' : '#f5455c') : '#5a6280');
  const rotation = isAboveAvgPace ? 6 : 0;
  const W = 192; const H = 28; const PAD_R = 18;
  const chartW = W - PAD_R;

  // Monotone cubic spline builder (Fritsch-Carlson)
  const buildPath = (pts) => {
    const n = pts.length;
    if (n < 2) return { sparkPath: '', fillPath: '', lastPt: null };
    const slopes = [];
    for (let i = 0; i < n - 1; i++) slopes[i] = (pts[i+1].y - pts[i].y) / ((pts[i+1].x - pts[i].x) || 1);
    const m = Array(n).fill(0);
    m[0] = slopes[0]; m[n-1] = slopes[n-2];
    for (let i = 1; i < n - 1; i++) {
      if (slopes[i-1] * slopes[i] <= 0) m[i] = 0;
      else m[i] = (slopes[i-1] + slopes[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(slopes[i]) < 1e-10) { m[i] = m[i+1] = 0; continue; }
      const a = m[i] / slopes[i], b = m[i+1] / slopes[i];
      if (a*a + b*b > 9) { const t = 3 / Math.sqrt(a*a + b*b); m[i] = t*a*slopes[i]; m[i+1] = t*b*slopes[i]; }
    }
    let sparkPath = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = (pts[i+1].x - pts[i].x) / 3;
      sparkPath += ` C ${pts[i].x+dx},${pts[i].y+m[i]*dx} ${pts[i+1].x-dx},${pts[i+1].y-m[i+1]*dx} ${pts[i+1].x},${pts[i+1].y}`;
    }
    return { sparkPath, fillPath: sparkPath + ` L ${pts[n-1].x},${H} L ${pts[0].x},${H} Z`, lastPt: pts[n-1] };
  };

  // Stroke-dashoffset draw animation on first mount
  useEffect(() => {
    if (drawnRef.current || !sparkPathRef.current || !hasData) return;
    drawnRef.current = true;
    const path = sparkPathRef.current;
    try {
      const len = path.getTotalLength();
      path.style.strokeDasharray  = len;
      path.style.strokeDashoffset = len;
      path.style.transition = `stroke-dashoffset ${drawDuration}ms ease-out`;
      requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
    } catch {}
  }); // run after each render so ref is ready; drawnRef prevents re-animation

  // Collapsed: big pulsing comma + compact amount only
  if (collapsed) {
    const sign = todayNet >= 0 ? '+' : '-';
    const absNet = Math.abs(todayNet);
    const compact = `${sign}$${absNet >= 1000 ? (absNet/1000).toFixed(1)+'k' : absNet}`;
    return (
      <div style={{ textAlign: 'center', padding: '2px 0 0' }}>
        <svg width={40} height={36} style={{ overflow: 'visible', display: 'block', margin: '0 auto' }}>
          <text x={20} y={30} textAnchor="middle"
            fontFamily="'Playfair Display',Georgia,serif" fontSize={28} fill={color}
            style={{ animation: hasData ? 'commaPulse 2s ease-in-out infinite' : 'none',
              transition: 'transform 300ms ease', transformOrigin: '20px 30px',
              transform: hasData ? `rotate(${rotation}deg)` : 'none' }}
          >,</text>
        </svg>
        {hasData && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700, color, marginTop: 0, lineHeight: 1 }}>
            {compact}
          </div>
        )}
      </div>
    );
  }

  // Expanded state
  let sparkPath = '', fillPath = '', lastPt = null;
  if (hasData) {
    const vals = data.map(d => d.cumNet);
    const minV = Math.min(...vals), maxV = Math.max(...vals), range = maxV - minV || 1;
    const pts = data.map((d, i) => ({
      x: (i / (data.length - 1)) * chartW,
      y: 4 + (1 - (d.cumNet - minV) / range) * (H - 8),
    }));
    ({ sparkPath, fillPath, lastPt } = buildPath(pts));
  }

  const todayX = chartW * (new Date().getDate() - 1) / Math.max(daysInMonth - 1, 1);
  const gradId = 'spark-grad-exp';

  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {hovered && hasData && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: '#1e2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 8px', fontSize: 10, color: '#e2e8f0', whiteSpace: 'nowrap', zIndex: 100, pointerEvents: 'none' }}>
          Today: ${todaySpent.toLocaleString()} spent · {todayNet >= 0 ? '+' : '-'}${Math.abs(todayNet).toLocaleString()} net
        </div>
      )}
      {hasData ? (
        <>
          <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.12} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {fillPath && <path d={fillPath} fill={`url(#${gradId})`} />}
            {sparkPath && <path ref={sparkPathRef} d={sparkPath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />}
            <line x1={todayX} y1={0} x2={todayX} y2={H} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="2,2" />
            {lastPt && (
              <text x={lastPt.x + 2} y={lastPt.y + 8}
                fontFamily="'Playfair Display',Georgia,serif" fontSize={18} fill={color}
                style={{ animation: 'commaPulse 2s ease-in-out infinite',
                  transition: 'transform 300ms ease',
                  transformOrigin: `${lastPt.x + 2}px ${lastPt.y + 8}px`,
                  transform: `rotate(${rotation}deg)` }}
              >,</text>
            )}
          </svg>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color }}>
              {todayNet >= 0 ? '+' : '-'}${Math.abs(todayNet).toLocaleString()}
            </span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#6b7290' }}>this month</span>
          </div>
        </>
      ) : (
        <>
          <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
            <line x1={0} y1={H/2} x2={chartW} y2={H/2} stroke="#5a6280" strokeWidth={1} strokeDasharray="3,3" />
            <text x={chartW + 2} y={H/2 + 8} fontFamily="'Playfair Display',Georgia,serif" fontSize={18} fill="#5a6280">,</text>
          </svg>
          <div style={{ marginTop: 4, fontSize: 10, color: '#6b7290', fontFamily: "'DM Sans',sans-serif" }}>
            Upload data to see your Spark
          </div>
        </>
      )}
    </div>
  );
}

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

// ─── DECRYPT PROMPT MODAL ─────────────────────────────────────────────────────
// Shown on page load when a valid Supabase session exists but the encryption
// key isn't in memory (e.g. after a tab refresh). The user re-enters their
// password to re-derive the key and decrypt their cloud data.
function DecryptPromptModal({ email, onUnlock, onSignOut }) {
  const [pw,      setPw]      = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async () => {
    if (!pw) return;
    setLoading(true); setError('');
    try {
      await onUnlock(pw);
    } catch (err) {
      setError(err.message === 'DECRYPTION_FAILED'
        ? 'Wrong password. Please try again.'
        : 'Failed to decrypt. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const box = {
    background: '#13131f', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 360,
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  };

  return (
    <div style={overlay}>
      <div style={box}>
        <div style={{ fontSize: 20, marginBottom: 4 }}>🔐</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Enter your password</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18, lineHeight: 1.6 }}>
          Your data is encrypted. Enter your Comma password to decrypt it for this session.
          {email && <><br /><span style={{ color: '#475569' }}>{email}</span></>}
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Password"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }}
        />
        {error && <div style={{ fontSize: 11, color: '#f87171', marginBottom: 8 }}>{error}</div>}
        <button
          onClick={handleSubmit}
          disabled={!pw || loading}
          style={{ width: '100%', padding: '10px 0', borderRadius: 9, border: 'none', background: pw && !loading ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.06)', color: pw && !loading ? '#fff' : '#475569', fontSize: 13, fontWeight: 700, cursor: pw && !loading ? 'pointer' : 'not-allowed', fontFamily: 'inherit', marginBottom: 8 }}
        >{loading ? 'Decrypting…' : 'Unlock'}</button>
        <button
          onClick={onSignOut}
          style={{ width: '100%', padding: '8px 0', borderRadius: 9, border: '1px solid rgba(255,255,255,0.07)', background: 'transparent', color: '#475569', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
        >Sign out instead</button>
      </div>
    </div>
  );
}

// ─── AUTH SECTION (Settings tab) ─────────────────────────────────────────────
function passwordStrength(pw) {
  if (!pw || pw.length < 8) return { label: 'Too short', color: '#f87171', width: '15%' };
  const hasUpper = /[A-Z]/.test(pw);
  const hasNum   = /[0-9]/.test(pw);
  const hasSpec  = /[^A-Za-z0-9]/.test(pw);
  const score = (pw.length >= 12 ? 1 : 0) + (hasUpper ? 1 : 0) + (hasNum ? 1 : 0) + (hasSpec ? 1 : 0);
  if (score <= 1) return { label: 'Weak',   color: '#f87171', width: '30%' };
  if (score <= 2) return { label: 'Fair',   color: '#fbbf24', width: '55%' };
  if (score <= 3) return { label: 'Strong', color: '#34d399', width: '80%' };
  return           { label: 'Very strong', color: '#34d399', width: '100%' };
}

function AuthSection({
  authUser, userTier, authView, authLoading, authError, authSuccess,
  lastSynced, syncStatus, showForgotPw,
  onSetAuthView, onSignUp, onSignIn, onSignOut, onSyncNow, onSetShowForgotPw,
  onChangePassword,
}) {
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [showPw, setShowPw]       = useState(false);

  // Change-password form state
  const [showChangePw,    setShowChangePw]    = useState(false);
  const [curPw,           setCurPw]           = useState('');
  const [newPw,           setNewPw]           = useState('');
  const [confirmNewPw,    setConfirmNewPw]    = useState('');
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [changePwError,   setChangePwError]   = useState('');
  const [changePwSuccess, setChangePwSuccess] = useState('');

  const resetChangePwForm = () => { setCurPw(''); setNewPw(''); setConfirmNewPw(''); setChangePwError(''); setChangePwSuccess(''); };

  const handleChangePwSubmit = async () => {
    setChangePwError(''); setChangePwSuccess('');
    if (newPw !== confirmNewPw) { setChangePwError("New passwords don't match."); return; }
    if (newPw.length < 8)       { setChangePwError('New password must be at least 8 characters.'); return; }
    setChangePwLoading(true);
    try {
      await onChangePassword(curPw, newPw);
      setChangePwSuccess('Password changed. All data re-encrypted.');
      resetChangePwForm();
      setShowChangePw(false);
    } catch (err) {
      if (err.message === 'WRONG_CURRENT_PASSWORD') {
        setChangePwError('Current password is incorrect.');
      } else if (err.message === 'AUTH_UPDATE_FAILED') {
        setChangePwError('Password update failed. Data rolled back — try again.');
      } else if (err.message === 'RE_ENCRYPT_SAVE_FAILED') {
        setChangePwError('Failed to save re-encrypted data. Please try again.');
      } else {
        setChangePwError('An unexpected error occurred.');
      }
    } finally {
      setChangePwLoading(false);
    }
  };

  const resetForm = () => { setEmail(''); setPassword(''); setConfirmPw(''); setUnderstood(false); setShowPw(false); };

  const pwStrength = passwordStrength(password);
  const pwMatch    = password === confirmPw && confirmPw.length > 0;
  const canSignUp  = email && password.length >= 8 && pwMatch && understood;

  const sectionStyle = {
    marginBottom: 24,
    padding: '14px 16px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.015)',
    border: '1px solid rgba(255,255,255,0.06)',
  };
  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.2)',
    color: '#cbd5e1', fontSize: 12,
    fontFamily: 'inherit', outline: 'none',
    marginBottom: 8,
  };
  const btnPrimary = (disabled) => ({
    width: '100%', padding: '10px 0', borderRadius: 9,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.7)',
    color: disabled ? '#475569' : '#e0e7ff',
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
    opacity: disabled ? 0.6 : 1,
  });

  // ── Signed in view ──
  if (authUser) {
    const tierColors = { free: '#64748b', pro: '#818cf8', lifetime: '#34d399' };
    const tierColor  = tierColors[userTier] ?? '#64748b';
    const fmt = ts => ts ? new Date(ts).toLocaleString('en-AU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
    return (
      <div style={sectionStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
          <div>
            <div style={{ fontSize:11, color:'#475569', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:4 }}>Account</div>
            <div style={{ fontSize:13, color:'#cbd5e1' }}>{authUser.email}</div>
            <div style={{ marginTop:6, display:'inline-flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, fontWeight:700, background:`${tierColor}18`, color:tierColor, textTransform:'capitalize' }}>{userTier}</span>
              {lastSynced && <span style={{ fontSize:10, color:'#475569' }}>· Last synced {fmt(lastSynced)}</span>}
            </div>
          </div>
          <button
            onClick={onSignOut}
            style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'#64748b', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}
          >Sign out</button>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button
            onClick={onSyncNow}
            disabled={syncStatus === 'syncing'}
            style={{ padding:'8px 16px', borderRadius:9, border:'1px solid rgba(99,102,241,0.25)', background:'rgba(99,102,241,0.08)', color:'#818cf8', fontSize:12, fontWeight:600, cursor:syncStatus==='syncing'?'not-allowed':'pointer', fontFamily:'inherit', opacity:syncStatus==='syncing'?0.6:1 }}
          >{syncStatus === 'syncing' ? 'Syncing…' : 'Sync now'}</button>
          {syncStatus === 'synced'  && <span style={{ fontSize:11, color:'#34d399' }}>✓ Synced</span>}
          {syncStatus === 'offline' && <span style={{ fontSize:11, color:'#f59e0b' }}>⚠ Offline — queued</span>}
          {changePwSuccess && <span style={{ fontSize:11, color:'#34d399' }}>{changePwSuccess}</span>}
          {!changePwSuccess && authSuccess && syncStatus === 'idle' && <span style={{ fontSize:11, color:'#34d399' }}>{authSuccess}</span>}
          {authError   && <span style={{ fontSize:11, color:'#f87171' }}>{authError}</span>}
        </div>

        {/* ── Change password ── */}
        <div style={{ marginTop:14, borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:12 }}>
          <button
            onClick={() => { setShowChangePw(v => !v); resetChangePwForm(); }}
            style={{ background:'none', border:'none', color:'#475569', fontSize:11, cursor:'pointer', padding:0, fontFamily:'inherit', fontWeight:600 }}
          >{showChangePw ? '▲ Hide' : '▼ Change password'}</button>

          {showChangePw && (
            <div style={{ marginTop:10 }}>
              {/* Warning */}
              <div style={{ marginBottom:10, padding:'9px 11px', borderRadius:9, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.18)', fontSize:11, color:'#fbbf24', lineHeight:1.7 }}>
                Changing your password re-encrypts all your data. This may take a moment.
              </div>

              <input
                type="password"
                value={curPw}
                onChange={e => setCurPw(e.target.value)}
                placeholder="Current password"
                style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(0,0,0,0.2)', color:'#cbd5e1', fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:8 }}
              />

              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="New password"
                style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:9, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(0,0,0,0.2)', color:'#cbd5e1', fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:4 }}
              />
              {/* Strength bar */}
              {newPw && (() => { const s = passwordStrength(newPw); return (
                <div style={{ marginBottom:8 }}>
                  <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,0.06)', marginBottom:3 }}>
                    <div style={{ height:'100%', borderRadius:2, background:s.color, width:s.width, transition:'width 0.2s, background 0.2s' }} />
                  </div>
                  <div style={{ fontSize:10, color:s.color }}>{s.label}</div>
                </div>
              ); })()}

              <input
                type="password"
                value={confirmNewPw}
                onChange={e => setConfirmNewPw(e.target.value)}
                placeholder="Confirm new password"
                style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', borderRadius:9, border:`1px solid ${confirmNewPw && confirmNewPw !== newPw ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}`, background:'rgba(0,0,0,0.2)', color:'#cbd5e1', fontSize:12, fontFamily:'inherit', outline:'none', marginBottom:4 }}
              />
              {confirmNewPw && confirmNewPw !== newPw && <div style={{ fontSize:10, color:'#f87171', marginBottom:8 }}>Passwords don't match</div>}

              {changePwError && <div style={{ fontSize:11, color:'#f87171', marginBottom:8 }}>{changePwError}</div>}

              <button
                onClick={handleChangePwSubmit}
                disabled={changePwLoading || !curPw || !newPw || newPw !== confirmNewPw || newPw.length < 8}
                style={{ width:'100%', padding:'9px 0', borderRadius:9, border:'none', cursor: (changePwLoading || !curPw || !newPw || newPw !== confirmNewPw || newPw.length < 8) ? 'not-allowed' : 'pointer', background: (changePwLoading || !curPw || !newPw || newPw !== confirmNewPw || newPw.length < 8) ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.7)', color: (changePwLoading || !curPw || !newPw || newPw !== confirmNewPw || newPw.length < 8) ? '#475569' : '#e0e7ff', fontSize:12, fontWeight:700, fontFamily:'inherit', marginTop:4 }}
              >{changePwLoading ? 'Re-encrypting…' : 'Change Password'}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── None view (subtle links) ──
  if (authView === 'none') {
    return (
      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12, marginBottom:20 }}>
        {authSuccess && <span style={{ fontSize:11, color:'#34d399', flex:1 }}>{authSuccess}</span>}
        <button onClick={() => { resetForm(); onSetAuthView('signin'); }} style={{ background:'none', border:'none', color:'#475569', fontSize:11, cursor:'pointer', padding:0, fontFamily:'inherit' }}>Sign in</button>
        <button onClick={() => { resetForm(); onSetAuthView('signup'); }} style={{ background:'none', border:'none', color:'#818cf8', fontSize:11, cursor:'pointer', padding:0, fontFamily:'inherit', fontWeight:600 }}>Create account</button>
      </div>
    );
  }

  // ── Sign up form ──
  if (authView === 'signup') {
    return (
      <div style={sectionStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Create account</div>
          <button onClick={() => { resetForm(); onSetAuthView('none'); }} style={{ background:'none', border:'none', color:'#475569', fontSize:13, cursor:'pointer', padding:0, lineHeight:1 }}>✕</button>
        </div>

        {/* Warning box */}
        <div style={{ marginBottom:12, padding:'10px 12px', borderRadius:9, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', fontSize:11, color:'#fbbf24', lineHeight:1.7 }}>
          <strong>Important:</strong> Your password encrypts your data. If you forget it, your data cannot be recovered — by you or by us. We recommend using a password manager.
        </div>

        <input type="email"    value={email}     onChange={e=>setEmail(e.target.value)}     placeholder="Email"            style={inputStyle} />
        <div style={{ position:'relative', marginBottom:8 }}>
          <input type={showPw?'text':'password'} value={password}  onChange={e=>setPassword(e.target.value)}  placeholder="Password"         style={{...inputStyle, marginBottom:0, paddingRight:36}} />
          <button onClick={()=>setShowPw(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:12, padding:0, lineHeight:1 }}>{showPw?'🙈':'👁'}</button>
        </div>
        {/* Strength bar */}
        {password && (
          <div style={{ marginBottom:8 }}>
            <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,0.06)', marginBottom:4 }}>
              <div style={{ height:'100%', borderRadius:2, background:pwStrength.color, width:pwStrength.width, transition:'width 0.2s, background 0.2s' }} />
            </div>
            <div style={{ fontSize:10, color:pwStrength.color }}>{pwStrength.label}</div>
          </div>
        )}
        <input type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Confirm password"   style={{...inputStyle, borderColor: confirmPw && !pwMatch ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.08)'}} />
        {confirmPw && !pwMatch && <div style={{ fontSize:10, color:'#f87171', marginTop:-6, marginBottom:8 }}>Passwords don't match</div>}

        {/* Understanding checkbox */}
        <label style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:12, cursor:'pointer' }}>
          <input type="checkbox" checked={understood} onChange={e=>setUnderstood(e.target.checked)} style={{ marginTop:2, flexShrink:0 }} />
          <span style={{ fontSize:11, color:'#64748b', lineHeight:1.6 }}>I understand my password cannot be recovered</span>
        </label>

        {authError && <div style={{ marginBottom:8, fontSize:11, color:'#f87171' }}>{authError}</div>}

        <button onClick={() => onSignUp(email, password)} disabled={!canSignUp || authLoading} style={btnPrimary(!canSignUp || authLoading)}>
          {authLoading ? 'Creating account…' : 'Create Account'}
        </button>
      </div>
    );
  }

  // ── Sign in form ──
  if (authView === 'signin') {
    return (
      <div style={sectionStyle}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0' }}>Sign in</div>
          <button onClick={() => { resetForm(); onSetAuthView('none'); }} style={{ background:'none', border:'none', color:'#475569', fontSize:13, cursor:'pointer', padding:0, lineHeight:1 }}>✕</button>
        </div>

        <input type="email"    value={email}    onChange={e=>setEmail(e.target.value)}    placeholder="Email"    style={inputStyle} />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={inputStyle} />

        {authError && <div style={{ marginBottom:8, fontSize:11, color:'#f87171' }}>{authError}</div>}

        <button onClick={() => onSignIn(email, password)} disabled={!email || !password || authLoading} style={btnPrimary(!email || !password || authLoading)}>
          {authLoading ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          onClick={() => onSetShowForgotPw(v => !v)}
          style={{ background:'none', border:'none', color:'#475569', fontSize:11, cursor:'pointer', padding:'8px 0 0', fontFamily:'inherit', display:'block' }}
        >Forgot password?</button>

        {showForgotPw && (
          <div style={{ marginTop:8, padding:'10px 12px', borderRadius:9, background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.15)', fontSize:11, color:'#94a3b8', lineHeight:1.7 }}>
            Your data is encrypted with your password. If you've forgotten it, your data cannot be recovered. You can create a new account and start fresh.
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── FIRST UPLOAD REVEAL ──────────────────────────────────────────────────────
const REVEAL_CAT_LABELS = {
  grocery: 'Groceries', restaurant: 'Dining out', takeaway: 'Takeaway',
  health: 'Health', sub: 'Subscriptions', amazon: 'Amazon',
  delivery: 'Delivery', toll: 'Tolls', coffee: 'Coffee', other: 'Other',
  transport: 'Transport', entertainment: 'Entertainment', clothing: 'Clothing',
  education: 'Education', travel: 'Travel', utilities: 'Utilities',
};

function computeRevealData(parsedData) {
  const txCount      = parsedData.rowCount || 0;
  const monthCount   = parsedData.pnl?.length || 0;
  const totalIncome  = Math.round(parsedData.pnl?.reduce((s, r) => s + r.i, 0) || 0);
  const totalSpending= Math.round(parsedData.pnl?.reduce((s, r) => s + r.s, 0) || 0);
  const catTotals    = {};
  if (parsedData.rawTxs) {
    for (const tx of parsedData.rawTxs) {
      if (!tx.isIncome) catTotals[tx.cat] = (catTotals[tx.cat] || 0) + tx.absAmt;
    }
  }
  const topCats = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, amt]) => ({ cat, amt: Math.round(amt) }));
  return { txCount, monthCount, totalIncome, totalSpending, topCats };
}

function FirstUploadReveal({ data, onDismiss }) {
  const [counts, setCounts] = useState({
    txCount: 0, monthCount: 0, income: 0, spending: 0,
    cats: data.topCats.map(() => 0),
  });

  useEffect(() => {
    const start = performance.now();
    const duration = 500;
    let raf;
    function frame(now) {
      const raw = Math.min((now - start) / duration, 1);
      const t   = 1 - Math.pow(1 - raw, 3); // ease-out cubic
      setCounts({
        txCount:   Math.round(data.txCount * t),
        monthCount:Math.round(data.monthCount * t),
        income:    Math.round(data.totalIncome * t),
        spending:  Math.round(data.totalSpending * t),
        cats:      data.topCats.map(c => Math.round(c.amt * t)),
      });
      if (raw < 1) raf = requestAnimationFrame(frame);
    }
    const id = setTimeout(() => { raf = requestAnimationFrame(frame); }, 80);
    return () => { clearTimeout(id); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(7,8,15,0.88)', zIndex:9999 }}>
      <div style={{ maxWidth:420, width:'calc(100vw - 32px)', background:'#0c0e1a', borderRadius:20, border:'1px solid rgba(255,255,255,0.08)', padding:'36px 32px 28px', boxShadow:'0 24px 80px rgba(0,0,0,0.6)', display:'flex', flexDirection:'column', alignItems:'center' }}>

        {/* Logo mark */}
        <div style={{ width:52, height:52, background:'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, fontWeight:700, color:'#fff', lineHeight:1, paddingTop:5, userSelect:'none', marginBottom:16 }}>,</div>

        <h2 style={{ margin:'0 0 4px', fontSize:22, fontWeight:700, color:'#f1f5f9', textAlign:'center', fontFamily:"'Playfair Display',Georgia,serif" }}>Your data is in</h2>
        <p style={{ margin:'0 0 24px', fontSize:13, color:'#64748b', textAlign:'center' }}>Here's what Comma found</p>

        {/* Animated stat rows */}
        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
          {[
            { label:'Transactions found', val: counts.txCount.toLocaleString(),       color:'#e2e8f0' },
            { label:'Months of history',  val: counts.monthCount,                     color:'#e2e8f0' },
            { label:'Total income',       val:`$${counts.income.toLocaleString()}`,   color:'#34d399' },
            { label:'Total spending',     val:`$${counts.spending.toLocaleString()}`, color:'#f87171' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'10px 14px' }}>
              <span style={{ fontSize:13, color:'#94a3b8' }}>{label}</span>
              <span style={{ fontSize:14, fontWeight:700, color, fontFamily:'JetBrains Mono,monospace', minWidth:70, textAlign:'right' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Top categories */}
        {data.topCats.length > 0 && (
          <div style={{ width:'100%', marginBottom:24 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Top categories</div>
            {data.topCats.map((c, i) => (
              <div key={c.cat} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom: i < data.topCats.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span style={{ fontSize:13, color:'#94a3b8' }}>{REVEAL_CAT_LABELS[c.cat] || c.cat}</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#e2e8f0', fontFamily:'JetBrains Mono,monospace' }}>${counts.cats[i].toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <button onClick={onDismiss} style={{ width:'100%', padding:'13px', background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none', borderRadius:12, color:'#fff', fontSize:14, fontWeight:600, fontFamily:'inherit', cursor:'pointer', marginBottom:8 }}>
          See your dashboard →
        </button>
        <button onClick={onDismiss} style={{ background:'none', border:'none', color:'#475569', fontSize:12, cursor:'pointer', fontFamily:'inherit', padding:'4px 8px' }}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── ONBOARDING MODAL ─────────────────────────────────────────────────────────
function OnboardingModal({ onExploreDemo, onUploadCSV, onSignIn, onSignUp, authLoading, authError, onClearError }) {
  const [view,        setView]        = useState('welcome'); // 'welcome' | 'signin' | 'signup'
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [understood,  setUnderstood]  = useState(false);
  const [showPw,      setShowPw]      = useState(false);
  const [showForgotPw,setShowForgotPw]= useState(false);

  const switchView = (v) => {
    setView(v);
    setEmail(''); setPassword(''); setConfirmPw('');
    setUnderstood(false); setShowPw(false); setShowForgotPw(false);
    onClearError();
  };

  const pwStrength = passwordStrength(password);
  const pwMatch    = password === confirmPw && confirmPw.length > 0;
  const canSignUp  = email && password.length >= 8 && pwMatch && understood;

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.09)',
    background: 'rgba(0,0,0,0.25)',
    color: '#cbd5e1', fontSize: 13,
    fontFamily: 'inherit', outline: 'none',
    marginBottom: 10,
  };
  const btnPrimary = (disabled) => ({
    width: '100%', padding: '13px 0', borderRadius: 12,
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    background: disabled ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: disabled ? '#475569' : '#fff',
    fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
    opacity: disabled ? 0.6 : 1, marginTop: 4,
  });
  const backLink = (label, to) => (
    <button
      onClick={() => switchView(to)}
      style={{ background:'none', border:'none', color:'#64748b', fontSize:12, cursor:'pointer', padding:'0 0 20px', fontFamily:'inherit', display:'flex', alignItems:'center', gap:4, alignSelf:'flex-start' }}
      onMouseOver={e => e.currentTarget.style.color = '#94a3b8'}
      onMouseOut={e => e.currentTarget.style.color = '#64748b'}
    >
      ← {label}
    </button>
  );

  const logoMark = (
    <div style={{
      width: 52, height: 52,
      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 30, fontWeight: 700, color: '#fff', lineHeight: 1, paddingTop: 5,
      userSelect: 'none', marginBottom: 18,
    }}>,</div>
  );

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(7,8,15,0.75)', zIndex: 9999,
    }}>
      <div style={{
        maxWidth: 420, width: 'calc(100vw - 32px)',
        background: '#0c0e1a', borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.08)',
        padding: 40, boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>

        {/* ── Welcome view ── */}
        {view === 'welcome' && (<>
          {logoMark}
          <h1 style={{ margin:'0 0 8px', fontFamily:"'Playfair Display', Georgia, serif", fontSize:28, fontWeight:700, color:'#f1f5f9', textAlign:'center', letterSpacing:'-0.01em' }}>
            Welcome to Comma
          </h1>
          <p style={{ margin:'0 0 24px', fontSize:14, color:'#8b95b8', textAlign:'center', lineHeight:1.5 }}>
            Your privacy-first Australian finance dashboard
          </p>
          <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:10 }}>
            <button onClick={onExploreDemo} style={btnPrimary(false)} onMouseOver={e=>e.currentTarget.style.opacity='0.85'} onMouseOut={e=>e.currentTarget.style.opacity='1'}>
              Explore with demo data
            </button>
            <button
              onClick={onUploadCSV}
              style={{ width:'100%', padding:'13px', background:'transparent', border:'1px solid rgba(255,255,255,0.12)', borderRadius:12, color:'#fff', fontSize:14, fontWeight:600, fontFamily:'inherit', cursor:'pointer', transition:'opacity 0.15s' }}
              onMouseOver={e=>e.currentTarget.style.opacity='0.75'} onMouseOut={e=>e.currentTarget.style.opacity='1'}
            >
              Upload your bank CSV
            </button>
            <button
              onClick={() => switchView('signin')}
              style={{ background:'none', border:'none', color:'#8b95b8', fontSize:13, fontFamily:'inherit', cursor:'pointer', padding:'6px 0', textAlign:'center', marginTop:4 }}
              onMouseOver={e=>e.currentTarget.style.color='#a5b0cc'} onMouseOut={e=>e.currentTarget.style.color='#8b95b8'}
            >
              Sign in
            </button>
          </div>
          <p style={{ margin:'20px 0 0', fontSize:11, color:'#6b7290', textAlign:'center', lineHeight:1.5 }}>
            Works with CBA, NAB, ANZ, Westpac, Up Bank, Macquarie, and more
          </p>
        </>)}

        {/* ── Sign in view ── */}
        {view === 'signin' && (<>
          {backLink('Back', 'welcome')}
          {logoMark}
          <h2 style={{ margin:'0 0 20px', fontSize:22, fontWeight:700, color:'#f1f5f9', alignSelf:'flex-start' }}>Sign in</h2>
          <div style={{ width:'100%' }}>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" aria-label="Email" style={inputStyle} autoComplete="email" />
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" aria-label="Password" style={inputStyle} autoComplete="current-password" />
            {authError && <div style={{ marginBottom:10, fontSize:12, color:'#f87171' }}>{authError}</div>}
            <button onClick={() => onSignIn(email, password)} disabled={!email || !password || authLoading} style={btnPrimary(!email || !password || authLoading)}>
              {authLoading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              onClick={() => setShowForgotPw(v => !v)}
              style={{ background:'none', border:'none', color:'#64748b', fontSize:12, cursor:'pointer', padding:'12px 0 0', fontFamily:'inherit', display:'block' }}
            >Forgot password?</button>
            {showForgotPw && (
              <div style={{ marginTop:8, padding:'10px 14px', borderRadius:10, background:'rgba(248,113,113,0.05)', border:'1px solid rgba(248,113,113,0.15)', fontSize:12, color:'#94a3b8', lineHeight:1.7 }}>
                Password reset is disabled because your password is your encryption key. If you've forgotten it, your encrypted data cannot be recovered. You can create a new account and start fresh.
              </div>
            )}
            <button
              onClick={() => switchView('signup')}
              style={{ background:'none', border:'none', color:'#818cf8', fontSize:13, cursor:'pointer', padding:'16px 0 0', fontFamily:'inherit', display:'block', fontWeight:600 }}
              onMouseOver={e=>e.currentTarget.style.color='#a5b4fc'} onMouseOut={e=>e.currentTarget.style.color='#818cf8'}
            >
              Create account instead →
            </button>
          </div>
        </>)}

        {/* ── Create account view ── */}
        {view === 'signup' && (<>
          {backLink('Back to sign in', 'signin')}
          {logoMark}
          <h2 style={{ margin:'0 0 16px', fontSize:22, fontWeight:700, color:'#f1f5f9', alignSelf:'flex-start' }}>Create account</h2>
          <div style={{ width:'100%' }}>
            {/* Encryption warning */}
            <div style={{ marginBottom:14, padding:'10px 14px', borderRadius:10, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', fontSize:12, color:'#fbbf24', lineHeight:1.7 }}>
              Your password encrypts your data. If you forget it, your data cannot be recovered.
            </div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" aria-label="Email" style={inputStyle} autoComplete="email" />
            <div style={{ position:'relative', marginBottom:10 }}>
              <input type={showPw?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" aria-label="Password" style={{...inputStyle, marginBottom:0, paddingRight:38}} autoComplete="new-password" />
              <button onClick={()=>setShowPw(v=>!v)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:13, padding:0, lineHeight:1 }}>{showPw?'🙈':'👁'}</button>
            </div>
            {password && (
              <div style={{ marginBottom:10 }}>
                <div style={{ height:3, borderRadius:2, background:'rgba(255,255,255,0.06)', marginBottom:4 }}>
                  <div style={{ height:'100%', borderRadius:2, background:pwStrength.color, width:pwStrength.width, transition:'width 0.2s, background 0.2s' }} />
                </div>
                <div style={{ fontSize:11, color:pwStrength.color }}>{pwStrength.label}</div>
              </div>
            )}
            <input type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Confirm password" aria-label="Confirm password" style={{...inputStyle, borderColor: confirmPw && !pwMatch ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.09)'}} autoComplete="new-password" />
            {confirmPw && !pwMatch && <div style={{ fontSize:11, color:'#f87171', marginTop:-8, marginBottom:10 }}>Passwords don't match</div>}
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:14, cursor:'pointer' }}>
              <input type="checkbox" checked={understood} onChange={e=>setUnderstood(e.target.checked)} style={{ marginTop:2, flexShrink:0 }} />
              <span style={{ fontSize:12, color:'#64748b', lineHeight:1.6 }}>I understand my password cannot be recovered</span>
            </label>
            {authError && <div style={{ marginBottom:10, fontSize:12, color:'#f87171' }}>{authError}</div>}
            <button onClick={() => onSignUp(email, password)} disabled={!canSignUp || authLoading} style={btnPrimary(!canSignUp || authLoading)}>
              {authLoading ? 'Creating account…' : 'Create Account'}
            </button>
          </div>
        </>)}

      </div>
    </div>
  );
}

const VALID_TABS = new Set(tabGroups.flatMap(g => g.tabs.map(t => t.id)));

// ─── MOBILE OVERVIEW STORY ────────────────────────────────────────────────────
function MobileOverviewStory({
  ovCurNet, ovCurIncome, currentMonthSpend,
  sparkData, daysInCurrentMonth, isAboveAvgPace, todaySpentAmt, todayNet,
  ovTopCats, ovFmtCat,
  ovRecentTxs, ovFmtRelDate,
  uncatCount, ovGoalNear, isLiveData, ovNoCurrentMonth,
  nwSnapshots, currentMonthPrefix,
  setTab,
}) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFlash, setRefreshFlash] = useState(false);
  const [swipeOffsets, setSwipeOffsets] = useState({});
  const containerRef = useRef(null);
  const pullTouchStartY = useRef(null);
  const swipeTouchStarts = useRef({});
  const statScrollRef = useRef(null);
  const isTouch = typeof window !== 'undefined' && 'ontouchstart' in window;

  // Pull-to-refresh
  const handleContainerTouchStart = (e) => {
    const scrollTop = containerRef.current?.scrollTop || 0;
    pullTouchStartY.current = scrollTop <= 2 ? e.touches[0].clientY : null;
  };
  const handleContainerTouchMove = (e) => {
    if (pullTouchStartY.current === null) return;
    const deltaY = e.touches[0].clientY - pullTouchStartY.current;
    if (deltaY > 0) setPullY(Math.min(deltaY * 0.4, 80));
  };
  const handleContainerTouchEnd = () => {
    if (pullTouchStartY.current !== null && pullY >= 60 && !refreshing) {
      setRefreshing(true);
      setTimeout(() => {
        setRefreshing(false);
        setRefreshFlash(true);
        setTimeout(() => setRefreshFlash(false), 600);
      }, 700);
    }
    setPullY(0);
    pullTouchStartY.current = null;
  };

  // Transaction swipe
  const handleTxTouchStart = (id, e) => {
    swipeTouchStarts.current[id] = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTxTouchMove = (id, e) => {
    const start = swipeTouchStarts.current[id];
    if (!start) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = Math.abs(e.touches[0].clientY - start.y);
    if (dy > 20) { delete swipeTouchStarts.current[id]; return; }
    if (dx < 0) {
      e.preventDefault();
      setSwipeOffsets(prev => ({ ...prev, [id]: Math.max(dx, -120) }));
    }
  };
  const handleTxTouchEnd = (id) => {
    const offset = swipeOffsets[id] || 0;
    if (offset < -100) {
      setTab('search');
      setSwipeOffsets(prev => ({ ...prev, [id]: 0 }));
    } else if (offset < -60) {
      setSwipeOffsets(prev => ({ ...prev, [id]: -80 }));
    } else {
      setSwipeOffsets(prev => ({ ...prev, [id]: 0 }));
    }
    delete swipeTouchStarts.current[id];
  };

  // Haptic on stat card snap
  useEffect(() => {
    const el = statScrollRef.current;
    if (!el) return;
    const onEnd = () => { if (navigator.vibrate) navigator.vibrate(10); };
    el.addEventListener('scrollend', onEnd);
    return () => el.removeEventListener('scrollend', onEnd);
  }, []);

  // Smart prompts
  const prompts = [];
  if (ovNoCurrentMonth) prompts.push({ text: 'Upload this month\'s data', sub: 'Keep your dashboard current', tab: 'settings', icon: '📁' });
  if (uncatCount > 0) prompts.push({ text: `Review ${uncatCount} uncategorised transaction${uncatCount !== 1 ? 's' : ''}`, sub: 'Teach Comma your merchants', tab: 'search', icon: '🏷️' });
  if (nwSnapshots && (nwSnapshots.length === 0 || !nwSnapshots.some(s => s.date?.startsWith(currentMonthPrefix)))) {
    prompts.push({ text: 'Save a net worth snapshot', sub: 'Track your wealth over time', tab: 'networth', icon: '📸' });
  }
  if (ovGoalNear) {
    const pct = Math.round((ovGoalNear.savedSoFar || 0) / ovGoalNear.targetAmount * 100);
    prompts.push({ text: `${ovGoalNear.emoji || '🎯'} ${ovGoalNear.name} is ${pct}% complete!`, sub: 'Keep the momentum going', tab: 'goals', icon: null });
  }
  const shownPrompts = prompts.slice(0, 2);

  const MOB_CAT_EMOJI = { grocery: '🛒', restaurant: '🍽️', takeaway: '🥡', coffee: '☕', sub: '📱', subscription: '📱', transport: '🚇', fuel: '⛽', toll: '🚗', health: '💊', utilities: '💡', insurance: '🛡️', clothing: '👕', shopping: '🛍️', entertainment: '🎬', travel: '✈️', paypal: '💙', dining: '🍽️', other: '📦', fitness: '🏋️', personal_care: '💆' };

  const isPositive = ovCurNet >= 0;
  const netColor = isPositive ? '#22c98a' : '#f5455c';
  const peekScale = 1 + (Math.min(pullY, 40) / 40) * 0.05;
  const peekOverlay = pullY > 0 ? Math.min(pullY / 80, 1) * 0.05 : 0;
  const savingsRate = ovCurIncome > 0 ? Math.round((ovCurNet / ovCurIncome) * 100) : 0;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleContainerTouchStart}
      onTouchMove={handleContainerTouchMove}
      onTouchEnd={handleContainerTouchEnd}
      style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Pull indicator */}
      {(pullY > 12 || refreshing) && (
        <div style={{ textAlign: 'center', fontSize: 12, color: '#6b7290', height: refreshing ? 32 : Math.min(pullY * 0.5, 32), display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 6 }}>
          <span style={{ display: 'inline-block', animation: refreshing ? 'mobPullSpin 0.4s linear infinite' : 'none', opacity: pullY >= 60 || refreshing ? 1 : 0.5 }}>↻</span>
          {pullY >= 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}

      {/* ── SECTION 1: THE NUMBER ── */}
      <div style={{ paddingTop: 48, paddingBottom: 24, paddingLeft: 16, paddingRight: 16, textAlign: 'center', position: 'relative', background: peekOverlay > 0 ? `rgba(0,0,0,${peekOverlay})` : 'transparent' }}>
        <div style={{ transform: `scale(${peekScale})`, transition: pullY === 0 ? 'transform 0.3s ease' : 'none', display: 'inline-block' }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 36, fontWeight: 700, color: netColor, lineHeight: 1, animation: refreshFlash ? 'mobNetFlash 0.6s ease' : 'none' }}>
            <span style={{ fontSize: '80%', color: '#8b95b8' }}>{isPositive ? '+' : '-'}</span>
            <span style={{ fontSize: '80%', color: '#8b95b8' }}>$</span>
            {Math.abs(ovCurNet).toLocaleString()}
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#6b7290', fontFamily: "'DM Sans', sans-serif", marginTop: 6 }}>this month</div>
        <div style={{ margin: '12px -16px 0', height: 40, paddingLeft: 16, paddingRight: 16 }}>
          <CommaSpark
            data={sparkData}
            collapsed={false}
            todaySpent={todaySpentAmt}
            todayNet={todayNet || ovCurNet}
            daysInMonth={daysInCurrentMonth}
            isAboveAvgPace={isAboveAvgPace}
          />
        </div>
        <div style={{ marginTop: 16, fontSize: 14, color: '#475569', animation: 'mobBobChevron 2s ease-in-out infinite', display: 'inline-block' }}>⌄</div>
      </div>

      {/* ── SECTION 2: STAT CARDS ── */}
      <div
        ref={statScrollRef}
        style={{ display: 'flex', overflowX: 'auto', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', msOverflowStyle: 'none', gap: 10, paddingLeft: 16, paddingRight: 6, paddingBottom: 4, marginBottom: 20, WebkitOverflowScrolling: 'touch' }}
      >
        {[
          { label: 'Income', value: `$${ovCurIncome.toLocaleString()}`, bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.18)', color: '#34d399' },
          { label: 'Spending', value: `$${currentMonthSpend.toLocaleString()}`, bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.18)', color: '#f87171' },
          { label: 'Savings rate', value: `${savingsRate > 0 ? '+' : ''}${savingsRate}%`, bg: savingsRate >= 0 ? 'rgba(99,102,241,0.08)' : 'rgba(248,113,113,0.08)', border: savingsRate >= 0 ? 'rgba(99,102,241,0.18)' : 'rgba(248,113,113,0.18)', color: savingsRate >= 0 ? '#818cf8' : '#f87171' },
        ].map((card, i) => (
          <div key={i} style={{ flexShrink: 0, width: 'calc(80vw - 32px)', maxWidth: 260, scrollSnapAlign: 'start', background: card.bg, border: `1px solid ${card.border}`, borderRadius: 12, padding: 16, minHeight: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, color: '#6b7290', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: card.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{card.value}</div>
          </div>
        ))}
        <div style={{ flexShrink: 0, width: 10 }} />
      </div>

      {/* ── SECTION 3: SPENDING BREAKDOWN ── */}
      {ovTopCats.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingLeft: 16 }}>Top spending</div>
          <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, marginLeft: 16, marginRight: 16, overflow: 'hidden' }}>
            {ovTopCats.slice(0, 5).map(({ cat, amt }, i) => (
              <div key={cat} onClick={() => setTab('categories')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: i < Math.min(ovTopCats.length, 5) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', cursor: 'pointer', minHeight: 44 }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{MOB_CAT_EMOJI[cat] || '📦'}</span>
                <span style={{ fontSize: 13, color: '#94a3b8', flex: 1 }}>{ovFmtCat(cat)}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', fontFamily: "'JetBrains Mono', monospace" }}>${amt.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SECTION 4: RECENT ACTIVITY ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingLeft: 16 }}>Recent</div>
        <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, marginLeft: 16, marginRight: 16, overflow: 'hidden' }}>
          {ovRecentTxs.slice(0, 5).map((tx, i) => {
            const txId = tx.id || `mob-tx-${i}`;
            const offset = swipeOffsets[txId] || 0;
            const isUncategorised = !tx.cat || tx.cat === 'other';
            return (
              <div key={txId} style={{ position: 'relative', overflow: 'hidden', borderBottom: i < Math.min(ovRecentTxs.length, 5) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                {/* Action behind */}
                <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isUncategorised ? 'rgba(99,102,241,0.9)' : 'rgba(245,158,11,0.9)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{isUncategorised ? 'Categorise' : 'Flag tax'}</span>
                </div>
                {/* Row */}
                <div
                  onTouchStart={isTouch ? (e) => handleTxTouchStart(txId, e) : undefined}
                  onTouchMove={isTouch ? (e) => handleTxTouchMove(txId, e) : undefined}
                  onTouchEnd={isTouch ? () => handleTxTouchEnd(txId) : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', minHeight: 44, background: '#0c0e1a', transform: `translateX(${offset}px)`, transition: offset === 0 ? 'transform 0.25s ease-out' : 'none', position: 'relative', zIndex: 1 }}
                >
                  <span style={{ fontSize: 10, color: '#475569', minWidth: 54, flexShrink: 0 }}>{ovFmtRelDate(tx.date)}</span>
                  <span style={{ fontSize: 12, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.desc}</span>
                  <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: (tx.amount || 0) >= 0 ? '#34d399' : '#f87171', fontWeight: 600, flexShrink: 0 }}>
                    {(tx.amount || 0) >= 0 ? '+' : ''}${Math.abs(tx.amount || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION 5: SMART PROMPTS ── */}
      {shownPrompts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingLeft: 16 }}>Suggested</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 16, paddingRight: 16 }}>
            {shownPrompts.map((p, i) => (
              <div key={i} onClick={() => setTab(p.tab)} style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
                {p.icon && <span style={{ fontSize: 20, flexShrink: 0 }}>{p.icon}</span>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>{p.text}</div>
                  <div style={{ fontSize: 11, color: '#6b7290' }}>{p.sub}</div>
                </div>
                <span style={{ fontSize: 14, color: '#6366f1', flexShrink: 0 }}>→</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardInner() {
  const scrollPositions = useRef({});
  // Track which tabs have had their entrance animation — prevents re-animating on re-visit
  const enteredTabsRef  = useRef(new Set());
  const initialTab = (() => {
    const hash = window.location.hash.slice(1);
    return VALID_TABS.has(hash) ? hash : 'overview';
  })();
  const [tab, setTabState] = useState(initialTab);

  const setTab = (tabId) => {
    // Save scroll position for the outgoing tab
    scrollPositions.current[tab] = window.scrollY;
    setTabState(tabId);
    window.location.hash = tabId;
    // Restore scroll position for the incoming tab after render
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositions.current[tabId] ?? 0);
    }));
  };

  // isFirstTabEntry: true only on the first render of a given tab.
  // useEffect marks it as entered after render so subsequent renders skip the animation.
  const isFirstTabEntry = !enteredTabsRef.current.has(tab);
  useEffect(() => {
    enteredTabsRef.current.add(tab);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Returns inline style for a staggered card entrance (only on first tab visit)
  const cardStyle = (index) => isFirstTabEntry ? {
    animation: 'cardEntrance 200ms ease-out both',
    animationDelay: `${index * 50}ms`,
  } : {};

  // Hash routing: browser back/forward support
  useEffect(() => {
    const handler = () => {
      const t = window.location.hash.slice(1);
      if (VALID_TABS.has(t)) setTabState(t);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

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
  const settingsSectionRefs = useRef({});
  const [dropActive,    setDropActive]    = useState(false);
  const [confirmClear,  setConfirmClear]  = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('comma_uploaded_data') || '[]');
      return stored.map(item => {
        // Migration: old format stored rawCsvText but no parsedData — re-parse once
        if (item.rawCsvText && !item.parsedData) {
          return processUploadedFile(item.filename, item.rawCsvText);
        }
        // New format: reconstruct from stored parsedData (no rawCsvText kept)
        return {
          id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          filename: item.filename,
          rawCsvText: '',
          type: item.type,
          bankLabel: item.bankLabel,
          status: item.status,
          rowCount: item.rowCount || 0,
          dateRange: item.dateRange || null,
          parsedData: item.parsedData || null,
        };
      });
    } catch { return []; }
  });
  const [isMobile,       setIsMobile]       = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [mobileNavGroup, setMobileNavGroup] = useState(null); // label of open group in bottom nav secondary bar, or null
  const [mobTapGroup,    setMobTapGroup]    = useState(null); // label currently animating tap bounce
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('comma_sidebar_collapsed') || 'false'); } catch { return false; }
  });
  const [sidebarHidden,  setSidebarHidden]  = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
  const [autoCollapsed,  setAutoCollapsed]  = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024 && window.innerWidth < 1280);
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const curTab = window.location.hash.slice(1) || 'planner';
      const activeGroup = tabGroups.find(g => g.tabs.some(t => t.id === curTab))?.label;
      return new Set(activeGroup ? [activeGroup] : ['Summary']);
    } catch { return new Set(['Summary']); }
  });
  const [sidebarHoverGroup, setSidebarHoverGroup] = useState(null);
  const [hoveredNavRow, setHoveredNavRow] = useState(null); // tab id for shortcut hint
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchCat,      setSearchCat]      = useState('all');
  const [openCatPicker,  setOpenCatPicker]  = useState(null);  // tx key (date+desc) or null
  const [catConfirm,     setCatConfirm]     = useState(null);  // {pattern, cat, count, isFirst} or null
  const [pendingRule,    setPendingRule]    = useState(null);  // {txKey, tx, cat, editPattern} or null
  const [mappingFileId,  setMappingFileId]  = useState(null);
  const [showCatHint,    setShowCatHint]    = useState(() => {
    try { return !localStorage.getItem('comma_categorise_hint_dismissed'); } catch { return true; }
  });
  const [catPeriod,      setCatPeriod]      = useState('3mo');
  const [catPayMethod,   setCatPayMethod]   = useState('all');
  const [catExpanded,    setCatExpanded]    = useState(null);
  const [firstRecatDone, setFirstRecatDone] = useState(() => {
    try { return !!localStorage.getItem('comma_first_recat_done'); } catch { return false; }
  });
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      if (localStorage.getItem('comma_onboarded')) return false;
      const stored = JSON.parse(localStorage.getItem('comma_uploaded_data') || '[]');
      return stored.length === 0;
    } catch { return true; }
  });
  const [showReveal,    setShowReveal]    = useState(false);
  const [revealData,    setRevealData]    = useState(null);
  const [firstBloom,    setFirstBloom]    = useState(false);  // one-time bloom after first upload reveal
  const [upgradeToast,  setUpgradeToast]  = useState(false);  // tier upgrade toast
  const [isDataParsing, setIsDataParsing] = useState(false);  // skeleton screen during file parse
  const prevTierRef = useRef(null); // track previous tier for upgrade detection

  // ─── TOAST SYSTEM ─────────────────────────────────────────────────────────
  // Reusable notification toasts. type: 'success' | 'warning' | 'error'
  const [appToasts, setAppToasts] = useState([]);
  const showToast = (message, type = 'warning') => {
    const id = Date.now() + Math.random();
    setAppToasts(prev => [...prev.slice(-2), { id, message, type }]); // cap at 3 visible
    setTimeout(() => setAppToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };
  const QUOTA_MSG = 'Storage full — some data may not be saved. Clear old data in Settings or use cloud sync.';

  useEffect(() => {
    const h = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setSidebarHidden(w < 1024);
      setAutoCollapsed(w >= 1024 && w < 1280);
    };
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // Persist sidebar collapsed pref
  useEffect(() => {
    try { localStorage.setItem('comma_sidebar_collapsed', JSON.stringify(sidebarCollapsed)); }
    catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
  }, [sidebarCollapsed]);

  // Keep active group expanded when tab changes
  useEffect(() => {
    const g = tabGroups.find(grp => grp.tabs.some(t => t.id === tab));
    if (g) setExpandedGroups(prev => { const next = new Set(prev); next.add(g.label); return next; });
  }, [tab]);

  // Online/offline awareness
  useEffect(() => {
    const goOnline = () => { setIsOnline(true); setShowBackOnline(true); setTimeout(() => setShowBackOnline(false), 2000); };
    const goOffline = () => { setIsOnline(false); setShowBackOnline(false); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Keyboard shortcuts: 1/2/3/,// + Cmd+K reservation
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); return; } // TODO: Cmd+K opens quick search (9D)
      if (e.key === 'Escape') { setChatOpen(false); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1') setTab('overview');
      else if (e.key === '2') setTab('networth');
      else if (e.key === '3') setTab('categories');
      else if (e.key === '4') setTab('insights');
      else if (e.key === '5') setTab('goals');
      else if (e.key === '/') { e.preventDefault(); setTab('search'); }
      else if (e.key === ',') setTab('settings');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist parsed transaction data to localStorage whenever uploadedFiles changes.
  // rawCsvText is intentionally excluded — only parsedData is stored.
  // Manual/error entries are excluded as they cannot be restored without raw text.
  useEffect(() => {
    const toStore = uploadedFiles
      .filter(f => f.status === 'success' && f.parsedData)
      .map(({ id, filename, type, bankLabel, status, rowCount, dateRange, parsedData }) =>
        ({ id, filename, type, bankLabel, status, rowCount, dateRange, parsedData })
      );
    try { localStorage.setItem('comma_uploaded_data', JSON.stringify(toStore)); }
    catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
    queueSync('transactions', toStore);
  }, [uploadedFiles]);

  // ─── GOALS STATE ──────────────────────────────────────────────────────────
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('comma_goals') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem('comma_goals', JSON.stringify(goals)); }
    catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
    queueSync('goals', goals);
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
    const sheet = { assets: bsAssets, liabilities: bsLiabilities };
    try { localStorage.setItem('comma_balance_sheet', JSON.stringify(sheet)); }
    catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
    queueSync('balance_sheet', sheet);
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
    try { localStorage.setItem('comma_nw_snapshots', JSON.stringify(nwSnapshots)); }
    catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
    queueSync('snapshots', nwSnapshots);
  }, [nwSnapshots]);
  const [nwSnapshotMsg,        setNwSnapshotMsg]        = useState(null); // confirmation string
  const [nwSnapshotConfirm,    setNwSnapshotConfirm]    = useState(false); // pending replace?
  const [nwSelSnap,            setNwSelSnap]            = useState(null);  // clicked snapshot for breakdown
  const [nwExpandedSnaps,      setNwExpandedSnaps]      = useState(() => new Set());
  const [nwDeleteConfirm,      setNwDeleteConfirm]      = useState(null);  // snap id pending delete

  // ─── USER RULES STATE ─────────────────────────────────────────────────────
  const [userRules, setUserRules] = useState(() => {
    try { return JSON.parse(localStorage.getItem('comma_user_rules') || '{}'); }
    catch { return {}; }
  });

  useEffect(() => {
    try { localStorage.setItem('comma_user_rules', JSON.stringify(userRules)); }
    catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
    queueSync('user_rules', userRules);
  }, [userRules]);

  useEffect(() => {
    if (!catConfirm) return;
    const t = setTimeout(() => setCatConfirm(null), 4000);
    return () => clearTimeout(t);
  }, [catConfirm]);

  const addUserRule    = (pattern, category) => setUserRules(prev => ({ ...prev, [pattern]: category }));
  const deleteUserRule = (pattern)            => setUserRules(prev => { const n = { ...prev }; delete n[pattern]; return n; });
  const getUserRules   = ()                   => userRules;

  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('comma_preferences') || 'null');
      return saved ? { ...DEFAULT_PREFERENCES, ...saved } : DEFAULT_PREFERENCES;
    } catch { return DEFAULT_PREFERENCES; }
  });

  useEffect(() => {
    try { localStorage.setItem('comma_preferences', JSON.stringify(preferences)); }
    catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
    queueSync('preferences', preferences);
  }, [preferences]);

  const toggleHiddenCat = (cat) => setPreferences(prev => {
    const hidden = prev.hiddenCategories.includes(cat)
      ? prev.hiddenCategories.filter(c => c !== cat)
      : [...prev.hiddenCategories, cat];
    return { ...prev, hiddenCategories: hidden };
  });

  const [showImportRules, setShowImportRules] = useState(false);
  const [importRulesText, setImportRulesText] = useState('');
  const [importRulesStatus, setImportRulesStatus] = useState(null); // {ok:bool, msg:string}
  const [hoverDay, setHoverDay] = useState(null); // heatmap hover state
  const [settingsActiveSection, setSettingsActiveSection] = useState('data');

  // ─── AUTH STATE ──────────────────────────────────────────────────────────
  const [authUser,          setAuthUser]          = useState(null);
  const [userTier,          setUserTier]          = useState('free');
  // Detect tier upgrades (free → pro/lifetime) and show celebration toast once
  useEffect(() => {
    if (prevTierRef.current && prevTierRef.current === 'free' && (userTier === 'pro' || userTier === 'lifetime')) {
      try {
        if (!localStorage.getItem('comma_upgrade_celebrated')) {
          localStorage.setItem('comma_upgrade_celebrated', '1');
          setUpgradeToast(true);
          setTimeout(() => setUpgradeToast(false), 4500);
        }
      } catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') showToast(QUOTA_MSG, 'warning'); } // eslint-disable-line react-hooks/exhaustive-deps
    }
    prevTierRef.current = userTier;
  }, [userTier]); // eslint-disable-line react-hooks/exhaustive-deps
  const [upgradeOpen,       setUpgradeOpen]       = useState(false);
  const [purchaseToast,     setPurchaseToast]     = useState(null); // { tier: 'pro'|'lifetime' } | null
  const [authView,          setAuthView]          = useState('none'); // 'none' | 'signup' | 'signin'
  const [authLoading,       setAuthLoading]       = useState(false);
  const [authError,         setAuthError]         = useState('');
  const [authSuccess,       setAuthSuccess]       = useState('');
  const [lastSynced,        setLastSynced]        = useState(null);
  const [syncStatus,        setSyncStatus]        = useState('idle'); // 'idle'|'syncing'|'synced'|'offline'
  const [showForgotPw,      setShowForgotPw]      = useState(false);
  const [showDecryptPrompt, setShowDecryptPrompt] = useState(false);

  const authUserRef    = useRef(null);  // mirrors authUser for use in async callbacks
  const syncTimers     = useRef({});    // debounce timer per data type
  const syncQueue      = useRef(new Map()); // dataType → value, for offline retry
  const syncRetryRef   = useRef(null);  // retry timer handle
  const syncFadeRef    = useRef(null);  // "synced" fade-out timer handle
  const sessionPasswordRef = useRef(''); // in-memory only, cleared on sign-out

  // Keep authUserRef in sync
  useEffect(() => { authUserRef.current = authUser; }, [authUser]);

  // On app load: check for a pre-existing Supabase session (e.g. after a tab refresh).
  // If one exists but the encryption key isn't cached, show the decrypt prompt.
  useEffect(() => {
    async function restoreSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const user = session.user;
        authUserRef.current = user;
        setAuthUser(user);
        setUserTier(await getUserTier(user.id));
        // Key not in memory — prompt the user for their password
        if (!_encKey) setShowDecryptPrompt(true);
      } catch {
        // Silently ignore — user stays logged out
      }
    }
    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handler called by DecryptPromptModal when the user submits their password
  const handleDecryptUnlock = async (password) => {
    const user = authUserRef.current;
    if (!user) throw new Error('No session');
    const vault = await getVault(user.id);
    if (!vault) throw new Error('No vault found. Please sign in again.');
    // decryptAndLoadAll caches _encKey/_encSalt on success; throws on wrong password
    await decryptAndLoadAll(user.id, password, vault);
    setLastSynced(new Date().toISOString());
    setShowDecryptPrompt(false);
  };

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
      try { localStorage.setItem('comma_ai_config', JSON.stringify(next)); }
      catch (e) { if (e instanceof DOMException && e.name === 'QuotaExceededError') setTimeout(() => showToast(QUOTA_MSG, 'warning'), 0); } // eslint-disable-line react-hooks/exhaustive-deps
      return next;
    });
    setAiTestStatus(null);
  }

  // Sync ai_config to cloud whenever provider or model changes — intentionally excludes apiKey
  useEffect(() => {
    const configToSync = { provider: aiConfig.provider, model: aiConfig.model };
    if (configToSync.provider || configToSync.model) queueSync('ai_config', configToSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiConfig.provider, aiConfig.model]);

  // ── AI Chat state ──
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(false);
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
    { pattern: /\b(PayPal)\b/gi, tab: 'categories', label: null },
    { pattern: /\b(spending pattern(?:s)?|category breakdown|categories)\b/gi, tab: 'insights', label: null },
    { pattern: /\b(trend(?:s)?|month[- ]by[- ]month|monthly trend)\b/gi, tab: 'trend', label: null },
  ];

  function renderChatLine(line, lineKey) {
    const isBullet = /^[-*•]\s/.test(line);
    const isNum    = /^\d+\.\s/.test(line);
    const nodes = [];
    let k = 0;
    // Split line by **bold** and `code` markers
    const TOKEN_RE = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    const segs = [];
    let last = 0, m;
    while ((m = TOKEN_RE.exec(line)) !== null) {
      if (m.index > last) segs.push({ type: 'text', v: line.slice(last, m.index) });
      const t = m[0];
      segs.push(t.startsWith('**') ? { type: 'bold', v: t.slice(2, -2) } : { type: 'code', v: t.slice(1, -1) });
      last = m.index + t.length;
    }
    if (last < line.length) segs.push({ type: 'text', v: line.slice(last) });
    for (const seg of segs) {
      if (seg.type === 'bold') {
        nodes.push(<strong key={k++}>{seg.v}</strong>);
      } else if (seg.type === 'code') {
        nodes.push(<code key={k++} style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3, fontSize: 11 }}>{seg.v}</code>);
      } else {
        // Plain text: insert category nav buttons where patterns match
        let rem = seg.v;
        let guard = 0;
        while (rem && guard++ < 200) {
          let best = null, bestTab = null;
          for (const { pattern, tab } of CHAT_CATEGORY_LINKS) {
            const re = new RegExp(pattern.source, pattern.flags.replace('g', ''));
            const hit = re.exec(rem);
            if (hit && (!best || hit.index < best.index)) { best = hit; bestTab = tab; }
          }
          if (!best) { nodes.push(<span key={k++}>{rem}</span>); rem = ''; }
          else {
            if (best.index > 0) nodes.push(<span key={k++}>{rem.slice(0, best.index)}</span>);
            const navTab = bestTab;
            nodes.push(
              <button key={k++} onClick={() => setTab(navTab)}
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: '#a5b4fc', borderRadius: 4, padding: '0 5px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', lineHeight: '1.6' }}>
                {best[0]}
              </button>
            );
            rem = rem.slice(best.index + best[0].length);
          }
        }
      }
    }
    return (
      <div key={lineKey} style={{ marginLeft: (isBullet || isNum) ? 8 : 0, paddingLeft: (isBullet || isNum) ? 8 : 0, borderLeft: (isBullet || isNum) ? '2px solid rgba(255,255,255,0.1)' : 'none', marginBottom: line === '' ? 6 : 2 }}>
        {nodes.length > 0 ? nodes : '\u00A0'}
      </div>
    );
  }

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
  // Close chat panel on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setChatOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  // Drain message queue when streaming finishes
  useEffect(() => {
    if (!chatStreaming && chatQueueRef.current.length > 0) {
      const next = chatQueueRef.current.shift();
      sendChatMessage(next); // eslint-disable-line react-hooks/exhaustive-deps
    }
  }, [chatStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const text = (inputText !== undefined ? inputText : chatInput).trim().slice(0, 2000);
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
        setChatUnread(prev => prev || !chatOpen);
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
  const [goalError,      setGoalError]      = useState('');

  const handleUploadedFiles = (fileList) => {
    // Show skeleton only if parsing takes longer than 200ms (avoids flash on fast files)
    let skeletonTimer = null;
    if (fileList.length > 0) skeletonTimer = setTimeout(() => setIsDataParsing(true), 200);
    let remaining = fileList.length;
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
        setUploadedFiles(prev => {
          const isFirstBank =
            !localStorage.getItem('comma_reveal_shown') &&
            (record.type === 'bank' || record.type === 'upbank') &&
            record.status === 'success' &&
            record.parsedData &&
            prev.filter(f => (f.type === 'bank' || f.type === 'upbank') && f.status === 'success').length === 0;
          if (isFirstBank) {
            try { localStorage.setItem('comma_reveal_shown', 'true'); } catch {}
            setRevealData(computeRevealData(record.parsedData));
            setShowReveal(true);
          }
          remaining--;
          if (remaining === 0) { clearTimeout(skeletonTimer); setIsDataParsing(false); }
          return [...prev, record];
        });
      };
      reader.readAsText(file);
    });
  };

  const handleMappingSuccess = (fileId, data) => {
    setUploadedFiles(prev => {
      const isFirstBank =
        !localStorage.getItem('comma_reveal_shown') &&
        data &&
        prev.filter(f => (f.type === 'bank' || f.type === 'upbank') && f.status === 'success').length === 0;
      if (isFirstBank) {
        try { localStorage.setItem('comma_reveal_shown', 'true'); } catch {}
        setRevealData(computeRevealData(data));
        setShowReveal(true);
      }
      return prev.map(f => {
      if (f.id !== fileId) return f;
      const originalRawTxs = data?.rawTxs;
      let parsedData = data;
      if (originalRawTxs && Object.keys(userRules).length > 0) {
        parsedData = aggregateTxs(applyUserRules(originalRawTxs, userRules));
      }
      return { ...f, status: 'success', type: 'bank', bankLabel: 'Unknown Bank', rowCount: parsedData.rowCount || 0, dateRange: parsedData.dateRange || null, parsedData, originalRawTxs };
      });
    });
    setMappingFileId(null);
  };

  // ─── LIVE DATA FROM UPLOADS ──────────────────────────────────────────────
  // Cutoff date based on tier: free = current month only, pro = 12 months, lifetime = all
  const tierCutoff = useMemo(() => {
    const now = new Date();
    if (userTier === 'free') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (userTier === 'pro')  return new Date(now.getFullYear() - 1, now.getMonth(), 1);
    return null;
  }, [userTier]);

  const upData = useMemo(() => {
    const raw = uploadedFiles.filter(f => f.type === 'bank' || f.type === 'upbank').at(-1)?.parsedData ?? null;
    if (!raw || !tierCutoff || !raw.rawTxs) return raw;
    const filtered = raw.rawTxs.filter(tx => new Date(tx.date) >= tierCutoff);
    if (filtered.length === raw.rawTxs.length) return raw;
    return aggregateTxs(filtered);
  }, [uploadedFiles, tierCutoff]);

  // True when uploaded data has been trimmed by the tier cutoff
  const historyLimitActive = useMemo(() => {
    if (!tierCutoff) return false;
    const raw = uploadedFiles.filter(f => f.type === 'bank' || f.type === 'upbank').at(-1)?.parsedData ?? null;
    return !!(raw?.rawTxs?.some(tx => new Date(tx.date) < tierCutoff));
  }, [uploadedFiles, tierCutoff]);
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

  // Intersection observer: highlight the settings mini-nav pill as user scrolls
  useEffect(() => {
    if (tab !== 'settings') return;
    const refs = settingsSectionRefs.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting);
        if (visible.length === 0) return;
        // Pick the topmost visible section
        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        const id = Object.keys(refs).find(k => refs[k] === topmost.target);
        if (id) setSettingsActiveSection(id);
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 }
    );
    Object.values(refs).forEach(el => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [tab]);

  const handleLaunchDemo = () => {
    try { localStorage.setItem('comma_onboarded', 'true'); } catch {}
    setShowOnboarding(false);
    setTab('overview');
  };

  const handleOnboardingUploadCSV = () => {
    try { localStorage.setItem('comma_onboarded', 'true'); } catch {}
    setShowOnboarding(false);
    setTab('settings');
  };

  // Auth success closes the onboarding modal automatically
  useEffect(() => {
    if (authUser && showOnboarding) {
      try { localStorage.setItem('comma_onboarded', 'true'); } catch {}
      setShowOnboarding(false);
    }
  }, [authUser, showOnboarding]);

  // ─── AUTH INIT ───────────────────────────────────────────────────────────
  useEffect(() => {
    let subscription;
    getUser().then(async user => {
      if (user) { setAuthUser(user); setUserTier(await getUserTier(user.id)); }
    });
    onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setUserTier(user ? await getUserTier(user.id) : 'free');
    }).then(sub => { subscription = sub; });
    return () => subscription?.unsubscribe();
  }, []);

  // ─── REALTIME TIER UPDATES ────────────────────────────────────────────────
  // Instantly reflect tier changes (e.g. after purchase webhook) without polling.
  // If a tier is revoked (refund), data beyond the free window becomes inaccessible
  // but is never deleted — it reappears if the user re-upgrades.
  useEffect(() => {
    const userId = authUser?.id;
    if (!userId) return;
    const channel = supabase
      .channel('tier-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_tier',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        const newTier = payload.new?.tier;
        if (newTier) setUserTier(newTier);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id]);

  // ─── RETURN URL HANDLER ────────────────────────────────────────────────────
  // Detects ?purchase=success&tier=pro|lifetime after Lemon Squeezy redirect.
  // Shows a success toast, re-fetches tier, then polls every 3s (up to 30s) as
  // a fallback in case the webhook takes a moment or the realtime sub drops.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseSuccess = params.get('purchase');
    const purchasedTier   = params.get('tier');

    if (purchaseSuccess !== 'success' || !['pro', 'lifetime'].includes(purchasedTier)) return;

    // Clear params immediately so a refresh doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);

    const userId = authUser?.id;

    const applyTier = (tier) => {
      setUserTier(tier);
      setPurchaseToast({ tier });
      setTimeout(() => setPurchaseToast(null), 6000);
    };

    // First fetch — webhook may already have fired
    const poll = async () => {
      if (!userId) return;
      const current = await getUserTier(userId);
      if (current === purchasedTier) { applyTier(current); return; }

      // Show toast optimistically while we wait for webhook
      applyTier(purchasedTier);

      // Poll up to 10 times × 3s = 30s max
      let attempts = 0;
      const intervalId = setInterval(async () => {
        attempts++;
        const t = await getUserTier(userId);
        if (t === purchasedTier || attempts >= 10) {
          clearInterval(intervalId);
          if (t === purchasedTier) setUserTier(t);
        }
      }, 3000);
    };

    poll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── SYNC MANAGER ────────────────────────────────────────────────────────

  // Show "Synced" badge for 3s then revert to idle
  const showSynced = () => {
    setSyncStatus('synced');
    clearTimeout(syncFadeRef.current);
    syncFadeRef.current = setTimeout(() => setSyncStatus('idle'), 3000);
  };

  // Encrypt one data type with the cached key and save to Supabase.
  // Returns true on success.
  const doSync = async (dataType, value) => {
    const userId = authUserRef.current?.id;
    if (!userId || !_encKey || !_encSalt) return false;
    setSyncStatus('syncing');
    try {
      const blob = await encrypt(JSON.stringify(value), _encKey);
      const { success } = await saveEncryptedData(userId, dataType, blob);
      if (!success) throw new Error('save failed');
      setLastSynced(new Date().toISOString());
      syncQueue.current.delete(dataType);
      if (syncQueue.current.size === 0) showSynced();
      return true;
    } catch {
      setSyncStatus('offline');
      syncQueue.current.set(dataType, value);
      // Retry all queued types after 30s
      clearTimeout(syncRetryRef.current);
      syncRetryRef.current = setTimeout(flushSyncQueue, 30000);
      return false;
    }
  };

  // Flush all queued (failed) syncs — called on retry timer or next successful change
  const flushSyncQueue = async () => {
    if (syncQueue.current.size === 0) return;
    for (const [dt, val] of Array.from(syncQueue.current)) {
      await doSync(dt, val);
    }
  };

  // Debounce: wait 2s after last change before syncing, to avoid hammering Supabase
  const queueSync = (dataType, value) => {
    if (!_encKey || !_encSalt || !authUserRef.current) return;
    clearTimeout(syncTimers.current[dataType]);
    syncTimers.current[dataType] = setTimeout(() => doSync(dataType, value), 2000);
    // Also attempt to flush any offline queue on the next change
    if (syncQueue.current.size > 0) {
      clearTimeout(syncRetryRef.current);
      syncRetryRef.current = setTimeout(flushSyncQueue, 2100);
    }
  };

  // ─── AUTH HELPERS ────────────────────────────────────────────────────────

  const getLocalDataForSync = () => ({
    transactions: JSON.parse(localStorage.getItem('comma_uploaded_data') || '[]'),
    goals:        JSON.parse(localStorage.getItem('comma_goals')          || '[]'),
    snapshots:    JSON.parse(localStorage.getItem('comma_nw_snapshots')   || '[]'),
    balance_sheet:JSON.parse(localStorage.getItem('comma_balance_sheet')  || 'null'),
    user_rules:   JSON.parse(localStorage.getItem('comma_user_rules')     || '{}'),
    ai_config:    (() => { const c = JSON.parse(localStorage.getItem('comma_ai_config') || '{}'); const { apiKey: _, ...rest } = c; return rest; })(),
    preferences:  JSON.parse(localStorage.getItem('comma_preferences')    || 'null'),
  });

  const encryptAndUploadAll = async (userId, password, salt) => {
    const data = getLocalDataForSync();
    for (const [dataType, value] of Object.entries(data)) {
      if (!value || (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0)) continue;
      const blob = _encKey
        ? await encrypt(JSON.stringify(value), _encKey)
        : await encryptData(value, password, salt);
      await saveEncryptedData(userId, dataType, blob);
    }
  };

  const handleAuthSignUp = async (email, password) => {
    setAuthLoading(true); setAuthError(''); setAuthSuccess('');
    try {
      const { user, error } = await supaSignUp(email, password);
      if (error || !user) { setAuthError(error?.message || 'Sign up failed.'); return; }
      // Sign in immediately after signup to establish a valid JWT session
      const { user: signedInUser, error: signInError } = await supaSignIn(email, password);
      if (signInError || !signedInUser) { setAuthError(signInError?.message || 'Sign up succeeded but sign in failed.'); return; }
      // Small delay to ensure the session propagates before DB writes
      await new Promise(resolve => setTimeout(resolve, 500));
      const salt = generateSalt();
      await createVault(signedInUser.id, saltToBase64(salt));
      // Derive and cache the key before uploading
      _encSalt = salt;
      _encKey  = await deriveKey(password, salt);
      sessionPasswordRef.current = password;
      await encryptAndUploadAll(signedInUser.id, password, salt);
      authUserRef.current = signedInUser;
      setAuthUser(signedInUser);
      setUserTier(await getUserTier(signedInUser.id));
      setAuthView('none');
      setLastSynced(new Date().toISOString());
      setAuthSuccess('Account created. Your data is now encrypted and synced.');
    } catch (err) {
      setAuthError(err.message || 'An error occurred.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Shared helper: derive key, decrypt all blobs, populate state
  const decryptAndLoadAll = async (userId, password, vault) => {
    const salt       = base64ToSalt(vault.salt);
    const iterations = vault.iteration_count ?? 600000;
    // Derive key once, cache for the session
    const key       = await deriveKey(password, salt, iterations);
    const allBlobs  = await loadAllEncryptedData(userId);
    for (const [dataType, blob] of Object.entries(allBlobs)) {
      let decrypted;
      try {
        const plaintext = await (async () => {
          const combined = Uint8Array.from(atob(blob), c => c.charCodeAt(0));
          const iv = combined.slice(0, 12);
          const ciphertext = combined.slice(12);
          const buf = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
          return JSON.parse(new TextDecoder().decode(buf));
        })();
        decrypted = plaintext;
      } catch {
        throw new Error('DECRYPTION_FAILED');
      }
      if (dataType === 'transactions') {
        setUploadedFiles(decrypted.map(item => {
          // Migration: old synced format had rawCsvText — re-parse once
          if (item.rawCsvText && !item.parsedData) {
            return processUploadedFile(item.filename, item.rawCsvText);
          }
          return {
            id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            filename: item.filename,
            rawCsvText: '',
            type: item.type,
            bankLabel: item.bankLabel,
            status: item.status,
            rowCount: item.rowCount || 0,
            dateRange: item.dateRange || null,
            parsedData: item.parsedData || null,
          };
        }));
      } else if (dataType === 'goals') {
        setGoals(decrypted);
      } else if (dataType === 'snapshots') {
        setNwSnapshots(decrypted);
      } else if (dataType === 'balance_sheet') {
        if (decrypted?.assets) setBsAssets(decrypted.assets);
        if (decrypted?.liabilities) setBsLiabilities(decrypted.liabilities);
      } else if (dataType === 'user_rules') {
        setUserRules(decrypted);
      } else if (dataType === 'ai_config') {
        saveAiConfig(decrypted);
      } else if (dataType === 'preferences') {
        setPreferences(prev => ({ ...DEFAULT_PREFERENCES, ...prev, ...decrypted }));
      }
    }
    // Cache key + salt for auto-sync
    _encKey  = key;
    _encSalt = salt;
    sessionPasswordRef.current = password;
  };

  const handleAuthSignIn = async (email, password) => {
    setAuthLoading(true); setAuthError(''); setAuthSuccess('');
    try {
      const { user, error } = await supaSignIn(email, password);
      if (error || !user) { setAuthError('Incorrect password. Please try again.'); return; }
      const vault = await getVault(user.id);
      if (!vault) { setAuthError('Incorrect password. Please try again.'); await supaSignOut(); return; }
      try {
        await decryptAndLoadAll(user.id, password, vault);
      } catch {
        setAuthError('Incorrect password. Please try again.'); await supaSignOut(); return;
      }
      authUserRef.current = user;
      setAuthUser(user);
      setUserTier(await getUserTier(user.id));
      setAuthView('none');
      setLastSynced(new Date().toISOString());
      setAuthSuccess('Signed in. Your encrypted data has been loaded.');
    } catch (err) {
      setAuthError('Incorrect password. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const clearUserData = () => {
    // Remove all comma_* localStorage keys except UX preferences that aren't user data
    const KEEP = new Set(['comma_onboarded', 'comma_sidebar_collapsed']);
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('comma_') && !KEEP.has(key)) toRemove.push(key);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  };

  const handleAuthSignOut = async () => {
    await supaSignOut();
    clearUserData();
    // Wipe all in-memory key material
    _encKey  = null;
    _encSalt = null;
    sessionPasswordRef.current = '';
    authUserRef.current = null;
    // Cancel any pending sync timers
    Object.values(syncTimers.current).forEach(clearTimeout);
    syncTimers.current = {};
    syncQueue.current.clear();
    clearTimeout(syncRetryRef.current);
    clearTimeout(syncFadeRef.current);
    setSyncStatus('idle');
    setAuthUser(null);
    setUserTier('free');
    setAuthView('none');
    setAuthError(''); setAuthSuccess('');
  };

  const handleSyncNow = async () => {
    if (!authUser) return;
    // If key not cached (e.g. tab reload before decrypt prompt answered), skip
    if (!_encKey || !_encSalt) {
      setAuthError('Enter your password to unlock sync.');
      setShowDecryptPrompt(true);
      return;
    }
    setSyncStatus('syncing');
    try {
      const data = getLocalDataForSync();
      for (const [dataType, value] of Object.entries(data)) {
        if (!value || (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0)) continue;
        const blob = await encrypt(JSON.stringify(value), _encKey);
        await saveEncryptedData(authUser.id, dataType, blob);
      }
      syncQueue.current.clear();
      setLastSynced(new Date().toISOString());
      showSynced();
    } catch {
      setSyncStatus('offline');
      setAuthError('Sync failed. Please try again.');
    }
  };

  // ─── CHANGE PASSWORD ─────────────────────────────────────────────────────
  const handleChangePassword = async (currentPassword, newPassword) => {
    const user = authUserRef.current;
    if (!user || !_encKey || !_encSalt) throw new Error('Not authenticated.');

    // 1. Verify current password by attempting to decrypt a known blob
    const vault = await getVault(user.id);
    if (!vault) throw new Error('Vault not found.');
    const salt = base64ToSalt(vault.salt);
    const iterations = vault.iteration_count ?? 600000;
    const oldKey = await deriveKey(currentPassword, salt, iterations);

    // Load all encrypted blobs
    const allBlobs = await loadAllEncryptedData(user.id);
    const entries = Object.entries(allBlobs);

    // Verify current password against first available blob
    // `decrypt` and `encrypt` are the statically-imported low-level functions
    if (entries.length > 0) {
      const [, firstBlob] = entries[0];
      try {
        await decrypt(firstBlob, oldKey);
      } catch {
        throw new Error('WRONG_CURRENT_PASSWORD');
      }
    }

    // 2. Derive new key
    const newKey = await deriveKey(newPassword, salt, iterations);

    // 3. Re-encrypt all blobs: decrypt with old key, encrypt with new key
    const reEncrypted = {};
    for (const [dataType, blob] of entries) {
      const plaintext = await decrypt(blob, oldKey);
      reEncrypted[dataType] = await encrypt(plaintext, newKey);
    }

    // 4. Save re-encrypted blobs to Supabase
    const saveErrors = [];
    for (const [dataType, newBlob] of Object.entries(reEncrypted)) {
      const { error } = await saveEncryptedData(user.id, dataType, newBlob);
      if (error) saveErrors.push({ dataType, error });
    }
    if (saveErrors.length > 0) {
      throw new Error('RE_ENCRYPT_SAVE_FAILED');
    }

    // 5. Update Supabase auth password
    const { error: authUpdateError } = await supabase.auth.updateUser({ password: newPassword });
    if (authUpdateError) {
      // Roll back: re-encrypt with old key
      for (const [dataType, blob] of entries) {
        await saveEncryptedData(user.id, dataType, blob);
      }
      throw new Error('AUTH_UPDATE_FAILED');
    }

    // 6. Update cached key in memory
    _encKey = newKey;
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

  // ─── COMMA SPARK + NAV BADGE DATA ────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  const currentMonthPrefix = todayStr.slice(0, 7);
  const daysInCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  const sparkData = useMemo(() => {
    if (isLiveData) {
      const dayMap = {};
      transactions.forEach(tx => {
        if (tx.date?.startsWith(currentMonthPrefix)) dayMap[tx.date] = (dayMap[tx.date] || 0) + (tx.amount || 0);
      });
      const sorted = Object.keys(dayMap).sort();
      let cum = 0;
      return sorted.map(day => { cum += dayMap[day]; return { day, cumNet: Math.round(cum) }; });
    }
    // Demo: spread last pnl month income over dailyTotals days
    const lastPnl = pnl[pnl.length - 1];
    if (!lastPnl) return [];
    const allKeys = Object.keys(dailyTotals).sort();
    const latestMM = allKeys.length ? allKeys[allKeys.length - 1].slice(0, 7) : null;
    if (!latestMM) return [];
    const mKeys = allKeys.filter(k => k.startsWith(latestMM));
    const dailyInc = lastPnl.i / (mKeys.length || 1);
    let cum = 0;
    return mKeys.map(day => { cum += dailyInc - dailyTotals[day]; return { day, cumNet: Math.round(cum) }; });
  }, [transactions, isLiveData, pnl, dailyTotals, currentMonthPrefix]); // eslint-disable-line react-hooks/exhaustive-deps

  const sparkMonthNet = sparkData.length > 0 ? sparkData[sparkData.length - 1].cumNet : (pnl.length > 0 ? pnl[pnl.length - 1].n : 0);
  const daysElapsed = Math.max(new Date().getDate(), 1);
  const currentMonthSpend = isLiveData
    ? Math.round(transactions.filter(tx => tx.date?.startsWith(currentMonthPrefix) && (tx.amount || 0) < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0))
    : (pnl.length > 0 ? pnl[pnl.length - 1].s : 0);
  const todaySpentAmt = isLiveData
    ? transactions.filter(tx => tx.date === todayStr && (tx.amount || 0) < 0).reduce((s, tx) => s + Math.abs(tx.amount), 0)
    : dailyTotals[todayStr] || 0;
  const avgDailySpend = currentMonthSpend / daysElapsed;
  const isAboveAvgPace = todaySpentAmt > avgDailySpend;

  const hasGoalNear80 = goals.some(g => g.targetAmount > 0 && (g.savedSoFar || 0) / g.targetAmount >= 0.8);
  const dataUploadedThisMonth = isLiveData && uploadedFiles.some(f =>
    f.status === 'success' && f.dateRange?.end?.startsWith(currentMonthPrefix)
  );

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
  const saveGoalDraft    = () => {
    const target = parseFloat(goalDraft.targetAmount);
    const saved  = parseFloat(goalDraft.savedSoFar) || 0;
    if (!target || target <= 0) { setGoalError('Target must be greater than $0'); return; }
    if (saved < 0) { setGoalError('Amount saved cannot be negative'); return; }
    setGoalError('');
    const g={id:editingGoalId||('g'+Date.now()),emoji:goalDraft.emoji||'🎯',name:sanitiseUserInput(goalDraft.name,100)||'Goal',targetAmount:target,targetDate:goalDraft.targetDate,savedSoFar:saved};
    if(editingGoalId)updateGoal(editingGoalId,g);else addGoal(g);
    setShowGoalForm(false);setEditingGoalId(null);
  };
  const cancelGoalForm   = () => { setShowGoalForm(false); setEditingGoalId(null); setGoalError(''); };

  // ── Tier access helper ──────────────────────────────────────────────────────
  const canAccess = (feature) => {
    const access = {
      history_12mo:      ['pro', 'lifetime'],
      history_unlimited: ['lifetime'],
      nw_timeline:       ['pro', 'lifetime'],
      goal_projections:  ['pro', 'lifetime'],
      ai_chat:           ['pro', 'lifetime'],
      trend_tab:         ['pro', 'lifetime'],
      deep_dive_history: ['pro', 'lifetime'],
      household:         ['lifetime'],
    };
    return access[feature]?.includes(userTier) ?? false;
  };

  // ─── FAVICON NOTIFICATION DOT ────────────────────────────────────────────
  useEffect(() => {
    const goalMilestone = goals.some(g => g.targetAmount > 0 && (g.savedSoFar || 0) >= g.targetAmount);
    const showIndigoDot = uncatCount > 5;
    const showGreenDot  = !showIndigoDot && goalMilestone;
    if (!showIndigoDot && !showGreenDot) return;
    const dotColor = showIndigoDot ? '#4f6ef7' : '#22c98a';
    const link = document.querySelector("link[rel~='icon']");
    if (!link) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const ctx2d = canvas.getContext('2d');
      ctx2d.drawImage(img, 0, 0, 32, 32);
      ctx2d.beginPath();
      ctx2d.arc(26, 6, 6, 0, Math.PI * 2);
      ctx2d.fillStyle = dotColor;
      ctx2d.fill();
      link.href = canvas.toDataURL('image/png');
    };
    img.src = link.href;
  }, [uncatCount, goals]);

  // Clear favicon dot when user visits relevant tab
  useEffect(() => {
    if (tab === 'search' || tab === 'goals') {
      const link = document.querySelector("link[rel~='icon']");
      if (!link) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx2d = canvas.getContext('2d');
        ctx2d.drawImage(img, 0, 0, 32, 32);
        link.href = canvas.toDataURL('image/png');
      };
      // Reset to original by reloading
      const origHref = link.href;
      if (!origHref.startsWith('data:')) return; // already plain URL
      const baseImg = new Image();
      baseImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx2d = canvas.getContext('2d');
        ctx2d.drawImage(baseImg, 0, 0, 32, 32);
        link.href = canvas.toDataURL('image/png');
      };
    }
  }, [tab]);

  // ─── CATEGORIES TAB DATA ──────────────────────────────────────────────────
  const catData = useMemo(() => {
    const detectPM = (desc) => {
      if (/paypal/i.test(desc)) return 'paypal';
      if (/afterpay|zippay|zip\s*co|laybuy|humm/i.test(desc)) return 'bnpl';
      if (/\btransfer\b|bpay|pay.?anyone|osko/i.test(desc)) return 'transfer';
      if (/\batm\b|cash\s*with/i.test(desc)) return 'cash';
      return 'card';
    };
    const now = new Date();
    const days = catPeriod === '1mo' ? 30 : catPeriod === '6mo' ? 180 : catPeriod === '12mo' ? 365 : 90;
    const cutoff = new Date(now.getTime() - days * 86400000);
    const recentCut = new Date(now.getTime() - 30 * 86400000);
    const prevCut   = new Date(now.getTime() - 60 * 86400000);
    const SKIP = new Set(['income', 'personal']);
    const totals = {}, merchants = {}, recent = {}, prev = {};
    transactions.forEach(tx => {
      if (SKIP.has(tx.cat)) return;
      const pm = detectPM(tx.desc);
      if (catPayMethod !== 'all' && pm !== catPayMethod) return;
      const txDate = new Date(tx.date);
      const c = tx.cat || 'other';
      const amt = tx.amount || 0;
      if (txDate >= cutoff) {
        totals[c] = (totals[c] || 0) + amt;
        if (!merchants[c]) merchants[c] = {};
        const key = tx.desc.replace(/[^\w ]/g, '').trim().slice(0, 32);
        merchants[c][key] = (merchants[c][key] || 0) + amt;
      }
      if (txDate >= recentCut) recent[c] = (recent[c] || 0) + amt;
      else if (txDate >= prevCut) prev[c] = (prev[c] || 0) + amt;
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => {
        const p = prev[cat] || 0;
        const r = recent[cat] || 0;
        const mom = p > 0 ? Math.round(((r - p) / p) * 100) : null;
        const tops = Object.entries(merchants[cat] || {})
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([desc, amt]) => ({ desc, amt: Math.round(amt) }));
        return { cat, total: Math.round(total), mom, tops };
      });
  }, [transactions, catPeriod, catPayMethod]);

  const SidebarContent = ({ onSelect }) => (
    <>
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
    <>
    {showOnboarding && <OnboardingModal onExploreDemo={handleLaunchDemo} onUploadCSV={handleOnboardingUploadCSV} onSignIn={handleAuthSignIn} onSignUp={handleAuthSignUp} authLoading={authLoading} authError={authError} onClearError={() => { setAuthError(''); setAuthSuccess(''); }} />}
    {showReveal && revealData && <FirstUploadReveal data={revealData} onDismiss={() => {
      setShowReveal(false);
      setTab('overview');
      try {
        if (!localStorage.getItem('comma_first_overview_shown')) {
          localStorage.setItem('comma_first_overview_shown', '1');
          setFirstBloom(true);
          setTimeout(() => setFirstBloom(false), 1500);
        }
      } catch {}
    }} />}
    <div style={{ fontFamily: "'DM Sans','Instrument Sans',-apple-system,sans-serif", background: "#07080f", color: "#eef0f6", minHeight: "100vh", display: "flex", ...(showOnboarding ? { filter: 'blur(8px)', pointerEvents: 'none', userSelect: 'none' } : {}) }}>
      <style>{`
        @keyframes commaPulse{0%,100%{opacity:0.5}50%{opacity:1}}
        @keyframes mobBobChevron{0%,100%{transform:translateY(0)}50%{transform:translateY(4px)}}
        @keyframes mobPullSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes mobNetFlash{0%{color:inherit}30%{color:#22c98a}70%{color:#22c98a}100%{color:inherit}}
        @keyframes mobTapBounce{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}
        @keyframes backOnlineFade{0%{opacity:1}80%{opacity:1}100%{opacity:0}}
        @keyframes arrowUp{from{transform:translateY(3px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes arrowDown{from{transform:translateY(-3px);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes breatheSpacing{from{letter-spacing:0}to{letter-spacing:0.02em}}
        .breathe-spacing{animation:breatheSpacing 500ms ease-out both}
        @keyframes nwFloat{from{transform:translateY(2px)}to{transform:translateY(0)}}
        @keyframes nwSink{from{transform:translateY(-2px)}to{transform:translateY(0)}}
        @keyframes gradMesh{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        .overview-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .overview-grid .ov-span2{grid-column:span 2}
        .overview-grid .ov-span3{grid-column:1/-1}
        @media(max-width:1024px){.overview-grid{grid-template-columns:repeat(2,1fr)}.overview-grid .ov-span2{grid-column:span 2}.overview-grid .ov-span3{grid-column:1/-1}}
        @media(max-width:767px){.overview-grid{grid-template-columns:1fr}.overview-grid .ov-span2,.overview-grid .ov-span3{grid-column:span 1}}
        .arrow-up{animation:arrowUp 300ms ease-out both}
        .arrow-down{animation:arrowDown 300ms ease-out both}
        .nw-float{animation:nwFloat 300ms ease-out both}
        .nw-sink{animation:nwSink 300ms ease-out both}
        [data-mono],.font-mono{font-variant-numeric:tabular-nums}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#e2e8f0;cursor:pointer;border:2px solid #07080f;box-shadow:0 0 6px rgba(96,165,250,0.5)}
        input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#e2e8f0;cursor:pointer;border:2px solid #07080f}
        @media(hover:hover){
          .hover-card{transition:transform 150ms ease,box-shadow 150ms ease}
          .hover-card:hover{transform:translateY(-1px);box-shadow:0 4px 20px rgba(0,0,0,0.4)!important}
          .hover-card:active{transform:scale(0.99)}
        }
        @media print{
          #sidebar-desktop,#header-strip,#bottom-bar-mobile,.chat-panel-float,.ai-chat-fab,.upgrade-prompt,input[type=range],[class*=upgrade]{display:none!important}
          body,#root{background:#ffffff!important;color:#1a1a1a!important}
          .main-content{margin-left:0!important;padding:0 24px!important}
          *{box-shadow:none!important;text-shadow:none!important}
          .card-panel{background:#ffffff!important;border:1px solid #e0e0e0!important;break-inside:avoid}
          span,div{color:inherit}
          .print-header{display:flex!important;align-items:center;gap:12px;border-bottom:2px solid #1a1a1a;padding-bottom:16px;margin-bottom:24px;font-family:'DM Sans',sans-serif}
          .print-footer{display:block!important;text-align:center;margin-top:32px;border-top:1px solid #e0e0e0;padding-top:12px;font-size:11px;color:#888;font-family:'DM Sans',sans-serif}
        }
        @media not print{.print-header,.print-footer{display:none!important}}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes cardEntrance{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes barBounce{0%{transform:scaleY(1)}35%{transform:scaleY(1.25)}65%{transform:scaleY(0.92)}100%{transform:scaleY(1)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes streakGlow{0%,100%{text-shadow:none}50%{text-shadow:0 0 8px rgba(79,110,247,0.6),0 0 16px rgba(79,110,247,0.3)}}
        @keyframes bloomBorder{0%{box-shadow:none}30%{box-shadow:-8px 0 30px rgba(79,110,247,0.2)}100%{box-shadow:none}}
        @keyframes upgradePulse{0%,100%{box-shadow:none}50%{box-shadow:0 0 20px rgba(79,110,247,0.25)}}
        @keyframes confetti0{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(-18px,-72px) rotate(200deg);opacity:0}}
        @keyframes confetti1{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(12px,-58px) rotate(-150deg);opacity:0}}
        @keyframes confetti2{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(28px,-80px) rotate(270deg);opacity:0}}
        @keyframes confetti3{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(-8px,-65px) rotate(-230deg);opacity:0}}
        @keyframes confetti4{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(22px,-50px) rotate(180deg);opacity:0}}
        @keyframes confetti5{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(-30px,-44px) rotate(-100deg);opacity:0}}
        @keyframes confetti6{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(6px,-78px) rotate(310deg);opacity:0}}
        @keyframes confetti7{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(-24px,-60px) rotate(-280deg);opacity:0}}
        @keyframes confetti8{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(16px,-55px) rotate(120deg);opacity:0}}
        @keyframes confetti9{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(-10px,-70px) rotate(-190deg);opacity:0}}
        @keyframes confetti10{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(32px,-62px) rotate(240deg);opacity:0}}
        @keyframes confetti11{0%{transform:translate(0,0) rotate(0deg);opacity:1}100%{transform:translate(-20px,-48px) rotate(-320deg);opacity:0}}
        @keyframes toastSlideIn{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes toastSlideOut{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(-12px)}}
        .card-entrance{animation:cardEntrance 200ms ease-out both}
        .skeleton-shimmer{background:linear-gradient(90deg,rgba(255,255,255,0.03) 0%,rgba(255,255,255,0.07) 50%,rgba(255,255,255,0.03) 100%);background-size:200% 100%;animation:shimmer 1.5s linear infinite}
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important}}
      `}</style>

      {/* Upgrade modal */}
      {upgradeOpen && <UpgradeModal onClose={() => setUpgradeOpen(false)} userTier={userTier} authUser={authUser} />}

      {/* Tier upgrade celebration toast — "Welcome to Pro" */}
      {upgradeToast && (
        <div style={{
          position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 10001,
          background: 'linear-gradient(135deg,#1e1b4b,#312e81)',
          border: '1px solid rgba(99,102,241,0.4)', borderLeft: '3px solid #6366f1',
          borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxWidth: 340, width: 'calc(100vw - 48px)',
          animation: 'toastSlideIn 250ms ease-out both',
        }}>
          <div style={{ fontSize: 22, flexShrink: 0 }}>✨</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>Welcome to Pro</div>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>12 months of history unlocked</div>
          </div>
          <button onClick={() => setUpgradeToast(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#475569', fontSize: 16, cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* App notification toasts — storage warnings, errors, etc. */}
      {appToasts.length > 0 && (
        <div style={{ position: 'fixed', top: upgradeToast ? 130 : 72, left: '50%', transform: 'translateX(-50%)', zIndex: 10002, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 400, width: 'calc(100vw - 48px)' }}>
          {appToasts.map(toast => {
            const borderColor = toast.type === 'success' ? '#22c98a' : toast.type === 'error' ? '#f5455c' : '#f5a623';
            return (
              <div key={toast.id} style={{ background: '#0f1117', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', borderLeft: `3px solid ${borderColor}`, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', animation: 'toastSlideIn 250ms ease-out both' }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', flex: 1, lineHeight: 1.55, fontFamily: "'DM Sans','Instrument Sans',sans-serif" }}>{toast.message}</div>
                <button onClick={() => setAppToasts(prev => prev.filter(t => t.id !== toast.id))} style={{ background: 'none', border: 'none', color: '#475569', fontSize: 16, cursor: 'pointer', flexShrink: 0, padding: '0 4px', lineHeight: 1 }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Purchase success toast */}
      {purchaseToast && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', zIndex:10000, background: purchaseToast.tier === 'lifetime' ? 'linear-gradient(135deg,#064e3b,#065f46)' : 'linear-gradient(135deg,#1e1b4b,#312e81)', border:`1px solid ${purchaseToast.tier === 'lifetime' ? 'rgba(52,211,153,0.4)' : 'rgba(129,140,248,0.4)'}`, borderRadius:16, padding:'16px 24px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 8px 32px rgba(0,0,0,0.5)', maxWidth:340, width:'calc(100vw - 48px)' }}>
          <div style={{ fontSize:28, flexShrink:0 }}>{purchaseToast.tier === 'lifetime' ? '🎉' : '✨'}</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#e2e8f0', marginBottom:3 }}>
              {purchaseToast.tier === 'lifetime' ? 'Welcome to Comma Lifetime!' : 'Welcome to Comma Pro!'}
            </div>
            <div style={{ fontSize:11, color:'#94a3b8', lineHeight:1.5 }}>
              {purchaseToast.tier === 'lifetime' ? 'All features unlocked forever — thanks for your support.' : '12 months of history and AI insights are now unlocked.'}
            </div>
          </div>
          <button onClick={() => setPurchaseToast(null)} style={{ marginLeft:'auto', background:'none', border:'none', color:'#475569', fontSize:16, cursor:'pointer', flexShrink:0, padding:'0 4px' }}>×</button>
        </div>
      )}

      {/* Decrypt prompt — shown on page reload when session exists but key is not cached */}
      {showDecryptPrompt && (
        <DecryptPromptModal
          email={authUser?.email}
          onUnlock={handleDecryptUnlock}
          onSignOut={() => { handleAuthSignOut(); setShowDecryptPrompt(false); }}
        />
      )}

      {/* ═══ DESKTOP SIDEBAR ═══ */}
      {!sidebarHidden && (() => {
        const effectiveCollapsed = sidebarCollapsed || autoCollapsed;
        const sidebarW = effectiveCollapsed ? 64 : 240;
        const { greeting, period } = getTimeOfDay();
        const userName = authUser?.email ? authUser.email.split('@')[0] : null;
        // Ambient tints — barely perceptible background washes per time period
        const headerTint = period === 'morning' ? 'rgba(255,200,100,0.03)'
          : period === 'evening' ? 'rgba(79,110,247,0.02)'
          : period === 'night' ? 'rgba(0,0,0,0.15)'
          : 'transparent';
        const pulseTextColor = period === 'night' ? '#8b95b8' : undefined;
        return (
          <nav id="sidebar-desktop" role="navigation" aria-label="Main navigation" style={{ width: sidebarW, flexShrink: 0, background: '#0c0e1a', borderRight: '1px solid rgba(255,255,255,0.06)', height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50, display: 'flex', flexDirection: 'column', transition: 'width 200ms ease', overflowX: 'hidden', overflowY: 'hidden', ...(upgradeToast ? { animation: 'upgradePulse 600ms ease-out 3' } : {}) }}>

            {/* ── Header: logo + greeting (ambient tint overlay) ── */}
            <div style={{ padding: effectiveCollapsed ? '18px 0 14px' : '18px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, background: headerTint, transition: 'background 1s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: effectiveCollapsed ? 'center' : 'flex-start', gap: 8, marginBottom: effectiveCollapsed ? 0 : 6 }}>
                <span style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800, fontSize: 22, lineHeight: 1, flexShrink: 0 }}>,</span>
                {!effectiveCollapsed && <span style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9' }}>Comma</span>}
              </div>
              {!effectiveCollapsed && (
                <div style={{ fontSize: 11, color: pulseTextColor || '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 1s ease' }}>
                  {greeting}{userName ? `, ${userName}` : ''}
                </div>
              )}
            </div>

            {/* ── Comma Spark (replaces plain financial pulse text) ── */}
            <div style={{ padding: effectiveCollapsed ? '8px 0' : '10px 16px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, overflow: 'hidden' }}>
              <CommaSpark
                data={sparkData}
                collapsed={effectiveCollapsed}
                todaySpent={todaySpentAmt}
                todayNet={sparkMonthNet}
                daysInMonth={daysInCurrentMonth}
                isAboveAvgPace={isAboveAvgPace}
                drawDuration={firstBloom ? 1200 : 800}
                upgradeFlash={upgradeToast}
              />
            </div>

            {/* ── Navigation groups ── */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 6, paddingBottom: 6, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {tabGroups.map(group => {
                const isActiveGroup = group.tabs.some(t => t.id === tab);
                const isExpanded = (expandedGroups.has(group.label) || isActiveGroup) && !effectiveCollapsed;
                return (
                  <div key={group.label} style={{ position: 'relative' }}>
                    {/* Group header */}
                    <button
                      title={effectiveCollapsed ? group.label : undefined}
                      aria-label={group.label}
                      onMouseEnter={() => effectiveCollapsed && setSidebarHoverGroup(group.label)}
                      onMouseLeave={() => setSidebarHoverGroup(null)}
                      onClick={() => {
                        if (effectiveCollapsed) {
                          if (!autoCollapsed) setSidebarCollapsed(false);
                          setExpandedGroups(new Set([group.label]));
                        } else {
                          setExpandedGroups(prev => {
                            const next = new Set(prev);
                            if (next.has(group.label) && !isActiveGroup) next.delete(group.label);
                            else next.add(group.label);
                            return next;
                          });
                        }
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: effectiveCollapsed ? 'calc(100% - 8px)' : 'calc(100% - 12px)', padding: effectiveCollapsed ? '8px 0' : '7px 12px', border: 'none', background: isActiveGroup && effectiveCollapsed ? 'rgba(99,102,241,0.1)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', justifyContent: effectiveCollapsed ? 'center' : 'flex-start', borderRadius: 6, margin: effectiveCollapsed ? '1px 4px' : '1px 6px', position: 'relative' }}>
                      <span style={{ fontSize: effectiveCollapsed ? 16 : 13, flexShrink: 0 }}>{group.icon}</span>
                      {!effectiveCollapsed && (
                        <>
                          <span style={{ fontSize: 10, fontWeight: 700, color: isActiveGroup ? '#94a3b8' : '#475569', textTransform: 'uppercase', letterSpacing: '0.08em', flex: 1, textAlign: 'left' }}>{group.label}</span>
                          {/* Nav group badges */}
                          {group.label === 'Spending' && currentMonthSpend > 0 && (
                            <span style={{ fontSize: 10, color: '#6b7290', fontFamily: "'JetBrains Mono',monospace", marginRight: 4 }}>${currentMonthSpend.toLocaleString()}</span>
                          )}
                          {group.label === 'Insights' && uncatCount > 0 && (
                            <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '1px 5px', marginRight: 4 }}>{uncatCount}</span>
                          )}
                          {group.label === 'Planning' && hasGoalNear80 && (
                            <span style={{ fontSize: 11, marginRight: 4 }}>🎯</span>
                          )}
                          {group.label === 'System' && !dataUploadedThisMonth && (
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', display: 'inline-block', marginRight: 4, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 10, color: '#334155' }}>{isExpanded ? '▾' : '›'}</span>
                        </>
                      )}
                      {/* Collapsed badges as dots */}
                      {effectiveCollapsed && (
                        <>
                          {group.label === 'Insights' && uncatCount > 0 && (
                            <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                          )}
                          {group.label === 'System' && !dataUploadedThisMonth && (
                            <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} />
                          )}
                          {group.label === 'Planning' && hasGoalNear80 && (
                            <span style={{ position: 'absolute', top: 6, right: 6, width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                          )}
                        </>
                      )}
                    </button>

                    {/* Hover tooltip (collapsed only) */}
                    {effectiveCollapsed && sidebarHoverGroup === group.label && (
                      <div style={{ position: 'fixed', left: 68, zIndex: 200, background: '#1e2235', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 600, color: '#e2e8f0', whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                        {group.label}
                      </div>
                    )}

                    {/* Sub-tabs — max-height transition for expand/collapse */}
                    <div style={{
                      overflow: 'hidden',
                      maxHeight: isExpanded ? `${group.tabs.length * 36}px` : '0px',
                      opacity: isExpanded ? 1 : 0,
                      transition: 'max-height 200ms ease, opacity 200ms ease',
                    }}>
                      <div style={{ paddingLeft: 4, paddingRight: 6, marginBottom: 2 }}>
                        {group.tabs.map(t => {
                          const KB_HINTS = { overview: '1', networth: '2', categories: '3', insights: '4', goals: '5', search: '/', settings: ',' };
                          const hint = KB_HINTS[t.id];
                          const isHovered = hoveredNavRow === t.id;
                          const isActive = tab === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => setTab(t.id)}
                              onMouseEnter={() => setHoveredNavRow(t.id)}
                              onMouseLeave={() => setHoveredNavRow(null)}
                              style={{ display: 'flex', alignItems: 'center', gap: 0, width: '100%', padding: '6px 10px 6px 6px', border: 'none', background: isActive ? 'rgba(99,102,241,0.1)' : isHovered ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 6, marginBottom: 1, textAlign: 'left', transition: 'background 150ms ease' }}
                            >
                              {/* Spring-based active indicator — transitions with overshoot */}
                              <div style={{
                                width: 3, alignSelf: 'stretch', borderRadius: 2,
                                background: isActive ? '#6366f1' : 'transparent',
                                flexShrink: 0, marginRight: 8,
                                transition: 'background 250ms cubic-bezier(0.34,1.56,0.64,1), transform 250ms cubic-bezier(0.34,1.56,0.64,1)',
                                transform: isActive ? 'scaleY(1)' : 'scaleY(0.4)',
                              }} />
                              <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? '#a5b4fc' : '#64748b', flex: 1, transition: 'color 150ms ease' }}>{t.l}</span>
                              {hint && isHovered && (
                                <span style={{ fontSize: 10, color: '#8b95b8', background: '#5a6280', borderRadius: 4, padding: '1px 5px', fontFamily: "'JetBrains Mono',monospace", flexShrink: 0, opacity: isHovered ? 1 : 0, transition: 'opacity 150ms ease' }}>{hint}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Footer ── */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: effectiveCollapsed ? '10px 0' : '10px 14px', flexShrink: 0 }}>
              {/* Offline / back-online indicator */}
              {!isOnline && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: effectiveCollapsed ? 0 : 6, justifyContent: effectiveCollapsed ? 'center' : 'flex-start' }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#5a6280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>
                  </svg>
                  {!effectiveCollapsed && <span style={{ fontSize: 10, color: '#6b7290' }}>Offline</span>}
                </div>
              )}
              {showBackOnline && (
                <div style={{ fontSize: 10, color: '#22c98a', marginBottom: 6, animation: 'backOnlineFade 2s ease forwards', display: effectiveCollapsed ? 'none' : 'block' }}>
                  ✓ Back online
                </div>
              )}
              {/* Sync status */}
              {!effectiveCollapsed && (
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                  {!authUser && <span style={{ color: '#334155' }}>Local only</span>}
                  {authUser && syncStatus === 'syncing' && isOnline && <span className="sync-syncing" style={{ color: '#f59e0b' }}>Syncing…</span>}
                  {authUser && syncStatus === 'synced' && isOnline && <span style={{ color: '#34d399', cursor: 'pointer' }} title={lastSynced ? `Last synced ${new Date(lastSynced).toLocaleTimeString()}` : 'Synced'} onClick={handleSyncNow}>✓ Synced</span>}
                  {authUser && (!isOnline || syncStatus === 'offline') && <span style={{ color: '#6b7290' }}>Sync paused</span>}
                  {historyLimitActive && !effectiveCollapsed && (
                    <button onClick={() => setUpgradeOpen(true)} style={{ marginLeft: 'auto', background:'none', border:'none', color:'#fbbf24', fontSize:9, fontWeight:700, cursor:'pointer', padding:0 }}>Month only ↑</button>
                  )}
                </div>
              )}

              {/* User pill */}
              {!effectiveCollapsed && authUser && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                    {authUser.email[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{authUser.email}</span>
                </div>
              )}

              {/* Upgrade card (free tier only) */}
              {!effectiveCollapsed && userTier === 'free' && (
                <button onClick={() => setUpgradeOpen(true)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2))', fontFamily: 'inherit', textAlign: 'left' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc', marginBottom: 2 }}>✨ Upgrade to Pro</div>
                  <div style={{ fontSize: 10, color: '#6366f1' }}>12 months of history + AI insights</div>
                </button>
              )}

              {/* Collapsed: small upgrade dot */}
              {effectiveCollapsed && userTier === 'free' && (
                <div style={{ textAlign: 'center' }}>
                  <button onClick={() => setUpgradeOpen(true)} title="Upgrade to Pro" style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#6366f1' }}>✨</button>
                </div>
              )}
            </div>

            {/* ── Collapse toggle (not shown when auto-collapsed by viewport) ── */}
            {!autoCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(c => !c)}
                title={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={effectiveCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                style={{ position: 'absolute', top: 20, right: -12, width: 24, height: 24, borderRadius: '50%', background: '#0c0e1a', border: '1px solid rgba(255,255,255,0.1)', color: '#475569', fontSize: 11, cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, flexShrink: 0 }}
              >
                {effectiveCollapsed ? '›' : '‹'}
              </button>
            )}
          </nav>
        );
      })()}

      {/* ═══ CONTENT HEADER (all viewports) ═══ */}
      {(() => {
        const hCollapsed = sidebarCollapsed || autoCollapsed;
        const hSidebarW = sidebarHidden ? 0 : (hCollapsed ? 64 : 240);
        const currentTabInfo = tabGroups.flatMap(g => g.tabs).find(t => t.id === tab);
        const tabLabel = currentTabInfo?.l?.replace(/^[^\p{L}\d(]+/u, '') || tab;
        const dr = upData?.dateRange;
        const drLabel = dr ? `${dr.start} – ${dr.end}` : 'Jul 2024 – Feb 2025';
        const txTotal = isLiveData ? transactions.length : 847;
        const headerSubtitle = (() => {
          switch (tab) {
            case 'overview': return `${drLabel} · ${txTotal.toLocaleString()} transactions`;
            case 'planner': return 'Monthly budget planner';
            case 'networth': return `Last snapshot: ${new Date().toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}`;
            case 'property': return 'Property & mortgage overview';
            case 'committed': return 'Fixed & semi-fixed expenses';
            case 'categories': return 'Spending by category';
            case 'health': return 'Medical & wellness spending';
            case 'subscriptions': return 'Recurring subscriptions';
            case 'savings': return 'Savings & emergency buffer';
            case 'insights': return 'Patterns, days & category trends';
            case 'deep': return 'Advanced financial analytics';
            case 'trend': return `${pnl.length} months · ${isLiveData ? 'Live data' : 'Demo data'}`;
            case 'heatmap': return 'Daily spending heatmap';
            case 'search': return `${txTotal.toLocaleString()} transactions · ${uncatCount} uncategorised`;
            case 'goals': {
              const n = goals.length;
              if (n === 0) return 'No goals set yet';
              return `${n} goal${n !== 1 ? 's' : ''} · $${goalTotalSaved.toLocaleString()} of $${goalTotalTarget.toLocaleString()} saved`;
            }
            case 'tax': return 'Australian income tax calculator';
            case 'compare': return 'Income & lifestyle comparison';
            case 'growth': return 'Investment & compound growth';
            case 'settings': return authUser?.email ? `Signed in as ${authUser.email}` : (isLiveData ? `${bankTxCount.toLocaleString()} transactions loaded` : 'Demo data');
            default: return '';
          }
        })();
        if (isMobile) return (
          <div id="header-strip" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 48, background: '#0c0e1a', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 45 }}>
            {/* Left: tab name only */}
            <div style={{ fontFamily: "'DM Sans','Instrument Sans',sans-serif", fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{tabLabel}</div>
            {/* Right: search + AI chat */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => { setSearchQuery(''); setTab('search'); }}
                title="Search"
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}
              >🔍</button>
              <button
                className="chat-fab"
                onClick={() => { setChatOpen(o => !o); setChatUnread(false); }}
                title="AI Chat"
                style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6ef7,#7c3aed)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, boxShadow: '0 2px 12px rgba(79,110,247,0.35)', position: 'relative', transition: 'transform 0.15s' }}>
                {chatOpen ? '✕' : '🤖'}
                {chatUnread && !chatOpen && (
                  <span style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#34d399', border: '2px solid #0b0b17' }} />
                )}
              </button>
            </div>
          </div>
        );

        return (
          <div id="header-strip" style={{ position: 'fixed', top: 0, left: hSidebarW, right: 0, height: 56, background: '#0c0e1a', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 45, transition: 'left 200ms ease' }}>
            {/* Left: hamburger (tablet) + tab name + subtitle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
              {sidebarHidden && !isMobile && (
                <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#94a3b8', fontSize: 16, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {menuOpen ? '✕' : '☰'}
                </button>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Sans','Instrument Sans',sans-serif", fontSize: 15, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tabLabel}</div>
                {headerSubtitle && <div style={{ fontSize: 12, color: '#6b7290', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{headerSubtitle}</div>}
              </div>
            </div>
            {/* Right: AI chat button */}
            <button
              className="chat-fab"
              onClick={() => { setChatOpen(o => !o); setChatUnread(false); }}
              title="AI Chat"
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#4f6ef7,#7c3aed)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, boxShadow: '0 2px 12px rgba(79,110,247,0.35)', flexShrink: 0, marginLeft: 12, position: 'relative', transition: 'transform 0.15s' }}>
              {chatOpen ? '✕' : '🤖'}
              {chatUnread && !chatOpen && (
                <span style={{ position: 'absolute', top: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: '#34d399', border: '2px solid #0b0b17' }} />
              )}
            </button>
          </div>
        );
      })()}

      {/* ═══ MENU OVERLAY (< 1024px) ═══ */}
      {sidebarHidden && !isMobile && menuOpen && (
        <div style={{ position: "fixed", top: 56, left: 0, right: 0, bottom: 0, zIndex: 99, background: "#0b0b17", overflowY: "auto", padding: "16px 12px 48px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <SidebarContent onSelect={() => setMenuOpen(false)} />
        </div>
      )}

      {/* ═══ MOBILE BOTTOM NAV ═══ */}
      {isMobile && (
        <>
          {/* Click-outside backdrop to dismiss secondary bar */}
          {mobileNavGroup && (
            <div
              onClick={() => setMobileNavGroup(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 88 }}
            />
          )}

          {/* Secondary sub-tab pills bar */}
          {mobileNavGroup && (() => {
            const group = tabGroups.find(g => g.label === mobileNavGroup);
            if (!group || group.tabs.length <= 1) return null;
            return (
              <div style={{
                position: 'fixed',
                bottom: 60,
                left: 0,
                right: 0,
                height: 40,
                background: 'rgba(12,14,26,0.95)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                paddingLeft: 12,
                paddingRight: 12,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                zIndex: 91,
                transform: 'translateY(0)',
                animation: 'slideUpBar 0.18s ease',
              }}>
                {group.tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setMobileNavGroup(null); }}
                    style={{
                      flexShrink: 0,
                      padding: '4px 12px',
                      borderRadius: 20,
                      border: tab === t.id ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.08)',
                      background: tab === t.id ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)',
                      color: tab === t.id ? '#818cf8' : '#64748b',
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.l}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Bottom nav bar */}
          <div id="bottom-bar-mobile" style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background: '#0c0e1a',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            zIndex: 90,
          }}>
            {tabGroups.map(group => {
              const isActiveGroup = group.tabs.some(t => t.id === tab);
              const isOpen = mobileNavGroup === group.label;
              const isTapping = mobTapGroup === group.label;
              return (
                <button
                  key={group.label}
                  aria-label={group.label}
                  onClick={() => {
                    setMobTapGroup(group.label);
                    setTimeout(() => setMobTapGroup(null), 150);
                    if (group.tabs.length === 1) {
                      setTab(group.tabs[0].id);
                      setMobileNavGroup(null);
                    } else {
                      setMobileNavGroup(isOpen ? null : group.label);
                    }
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    fontFamily: 'inherit',
                    animation: isTapping ? 'mobTapBounce 150ms ease' : 'none',
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1, filter: isActiveGroup || isOpen ? 'none' : 'grayscale(0.6) opacity(0.55)', transition: 'filter 150ms ease' }}>{group.icon}</span>
                  <span style={{ fontSize: 9, color: (isActiveGroup || isOpen) ? '#6366f1' : '#5a6280', fontWeight: isActiveGroup || isOpen ? 700 : 500, transition: 'color 150ms ease' }}>{group.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ═══ MAIN CONTENT ═══ */}
      <main role="main" className="main-content" style={{ flex: 1, padding: isMobile ? `60px 16px 80px` : sidebarHidden ? `72px 16px 48px` : "72px 24px 48px", minWidth: 0, marginLeft: sidebarHidden ? 0 : ((sidebarCollapsed || autoCollapsed) ? 64 : 240), transition: 'margin-left 200ms ease' }}>

      {/* Print-only header/footer */}
      <div className="print-header">
        <span style={{ fontWeight:800, fontSize:20, color:'#1a1a1a', fontFamily:"'DM Sans',sans-serif" }}>,</span>
        <span style={{ fontWeight:700, fontSize:16, color:'#1a1a1a', fontFamily:"'DM Sans',sans-serif" }}>Comma · getcomma.com.au</span>
        <span style={{ marginLeft:'auto', fontSize:11, color:'#666', fontFamily:"'DM Sans',sans-serif" }}>{new Date().toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}</span>
      </div>

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
          <button onClick={() => { setShowCatHint(false); try { localStorage.setItem('comma_categorise_hint_dismissed', 'true'); } catch {} }}
            style={{ background: "none", border: "none", color: "#f5a623", fontSize: 16, cursor: "pointer", padding: "0 2px", lineHeight: 1, opacity: 0.6, flexShrink: 0 }}>
            ✕
          </button>
        </div>
      )}

      {/* ─── Skeleton screen: shown during CSV parse (>200ms) on the overview ─── */}
      {isDataParsing && tab === 'overview' && (
        <div className="overview-grid" style={{ pointerEvents: 'none' }}>
          {[{ h: 80, span: '1/-1' }, { h: 140 }, { h: 140 }, { h: 200 }, { h: 140 }, { h: 200, span: '1/-1' }].map((s, i) => (
            <div key={i} className="skeleton-shimmer" style={{
              height: s.h, borderRadius: 14,
              gridColumn: s.span || undefined,
              background: 'rgba(255,255,255,0.03)',
            }} />
          ))}
        </div>
      )}

      {/* ─── Tab content wrapper — keyed so React remounts on tab change, triggering fadeSlideIn ─── */}
      <div key={tab} style={{ animation: 'fadeSlideIn 150ms ease-out', display: isDataParsing && tab === 'overview' ? 'none' : undefined }}>

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
      {tab === "overview" && (() => {
        // ─── CONTEXTUAL ENGINE ─────────────────────────────────────────────
        const ovNow = new Date();
        const ovDay = ovNow.getDate();
        const ovMonth = ovNow.getMonth();
        const ovTotalDays = new Date(ovNow.getFullYear(), ovMonth + 1, 0).getDate();
        const ovIsNewMonth = ovDay <= 3;
        // ovIsEOFY / ovIsWeekend / ovIsLastDay reserved for future hero card variants

        // No current month data (live data present but no tx this month)
        const ovNoCurrentMonth = isLiveData && !transactions.some(tx => tx.date?.startsWith(currentMonthPrefix));

        // Big spending day: today > 2× daily avg
        const ovBigSpend = todaySpentAmt > 2 * avgDailySpend && avgDailySpend > 0;

        // Goal nearest completion
        const ovGoalNear = goals.find(g => g.targetAmount > 0 && (g.savedSoFar || 0) / g.targetAmount >= 0.8) ?? null;

        // Savings streak: consecutive trailing months with positive net
        const ovStreak = (() => {
          let s = 0;
          for (let i = pnl.length - 1; i >= 0; i--) { if (pnl[i].n > 0) s++; else break; }
          return s;
        })();

        // Unusual category: any spending cat 50%+ above its prior-2-month avg
        const ovUnusualCat = (() => {
          if (!isLiveData || transactions.length === 0) return null;
          const byMonthCat = {};
          transactions.forEach(tx => {
            const mo = tx.date?.slice(0, 7);
            if (!mo || !tx.cat || tx.cat === 'income' || tx.cat === 'personal') return;
            if ((tx.amount || 0) >= 0) return;
            if (!byMonthCat[tx.cat]) byMonthCat[tx.cat] = {};
            byMonthCat[tx.cat][mo] = (byMonthCat[tx.cat][mo] || 0) + Math.abs(tx.amount);
          });
          let best = null;
          Object.entries(byMonthCat).forEach(([cat, monthly]) => {
            const cur = monthly[currentMonthPrefix];
            if (!cur) return;
            const prev = Object.entries(monthly).filter(([m]) => m < currentMonthPrefix).slice(-2);
            if (prev.length === 0) return;
            const avgPrev = prev.reduce((s, [, v]) => s + v, 0) / prev.length;
            const chg = avgPrev > 0 ? (cur - avgPrev) / avgPrev : 0;
            if (chg >= 0.5 && (!best || chg > best.change)) best = { name: cat, amount: Math.round(cur), change: Math.round(chg * 100) };
          });
          return best;
        })();

        // Net worth trend from snapshots
        const ovNWTrend = (() => {
          if (nwSnapshots.length < 2) return 'none';
          const last = nwSnapshots[nwSnapshots.length - 1].netWorth;
          const prev = nwSnapshots[nwSnapshots.length - 2].netWorth;
          const chg = prev !== 0 ? (last - prev) / Math.abs(prev) : 0;
          return chg > 0.02 ? 'up' : chg < -0.02 ? 'down' : 'stable';
        })();

        // Recurring charge day: 3+ merchants appearing on the same day-of-month across 3+ months
        const ovRecurringDay = (() => {
          if (!isLiveData || transactions.length === 0) return false;
          const merchantDays = {};
          transactions.forEach(tx => {
            if (!tx.date || !tx.amount || tx.amount >= 0) return;
            const d = parseInt(tx.date.slice(8, 10));
            const key = (tx.desc || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 20);
            if (!key) return;
            if (!merchantDays[key]) merchantDays[key] = new Set();
            merchantDays[key].add(d);
          });
          const near = Object.values(merchantDays).filter(days =>
            days.size >= 3 && (days.has(ovDay) || days.has(ovDay - 1) || days.has(ovDay + 1))
          );
          return near.length >= 3;
        })();

        // ─── HERO PRIORITY ─────────────────────────────────────────────────
        let heroPrio = 'default';
        if (ovNoCurrentMonth) heroPrio = 'noData';
        else if (ovIsNewMonth && pnl.length >= 2) heroPrio = 'newMonth';
        else if (ovBigSpend) heroPrio = 'bigSpend';
        else if (ovRecurringDay) heroPrio = 'recurring';
        else if (ovGoalNear) heroPrio = 'goalNear';
        else if (ovStreak >= 2) heroPrio = 'streak';

        // ─── CURRENT MONTH STATS ───────────────────────────────────────────
        const ovCurIncome = isLiveData
          ? Math.round(transactions.filter(tx => tx.date?.startsWith(currentMonthPrefix) && (tx.amount || 0) > 0).reduce((s, tx) => s + tx.amount, 0))
          : (pnl.length > 0 ? pnl[pnl.length - 1].i : 0);
        const ovCurNet = ovCurIncome - currentMonthSpend;
        const ovDaysLeft = ovTotalDays - ovDay;
        const ovProjected = isLiveData && daysElapsed > 0
          ? Math.round(ovCurNet + (ovCurNet / daysElapsed) * ovDaysLeft)
          : null;

        // Last / prev month for newMonth hero
        const ovLastMo = pnl.length >= 1 ? pnl[pnl.length - 1] : null;
        const ovPrevMo = pnl.length >= 2 ? pnl[pnl.length - 2] : null;
        const ovLastMoName = new Date(ovNow.getFullYear(), ovMonth - 1, 1).toLocaleString('en-AU', { month: 'long' });

        // Today's top transactions for bigSpend hero
        const ovTodayTxs = isLiveData
          ? transactions.filter(tx => tx.date === todayStr && (tx.amount || 0) < 0).sort((a, b) => a.amount - b.amount).slice(0, 3)
          : [];
        const ovTodayTotal = ovTodayTxs.reduce((s, tx) => s + Math.abs(tx.amount || 0), 0);
        const ovTodayMult = avgDailySpend > 0 ? (ovTodayTotal / avgDailySpend).toFixed(1) : null;

        // Net worth widget
        const ovLastSnap = nwSnapshots.length > 0 ? nwSnapshots[nwSnapshots.length - 1] : null;
        const ovPrevSnap = nwSnapshots.length > 1 ? nwSnapshots[nwSnapshots.length - 2] : null;
        const ovNWChange = ovLastSnap && ovPrevSnap ? ovLastSnap.netWorth - ovPrevSnap.netWorth : null;
        const ovPrevNWLabel = ovPrevSnap ? new Date(ovPrevSnap.date).toLocaleString('en-AU', { month: 'short' }) : null;
        const ovCurNW = ovLastSnap?.netWorth ?? NW_NOW;

        // Top categories this month
        const ovTopCats = (() => {
          if (!isLiveData) return [];
          const totals = {};
          transactions.forEach(tx => {
            if (!tx.date?.startsWith(currentMonthPrefix)) return;
            if (!tx.cat || tx.cat === 'income' || tx.cat === 'personal') return;
            if ((tx.amount || 0) >= 0) return;
            totals[tx.cat] = (totals[tx.cat] || 0) + Math.abs(tx.amount);
          });
          return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, amt]) => ({ cat, amt: Math.round(amt) }));
        })();
        const ovMaxCat = ovTopCats[0]?.amt || 1;

        // Recent transactions (last 8)
        const ovRecentTxs = transactions.slice(0, 8);
        const ovFmtRelDate = (ds) => {
          if (!ds) return '';
          const diff = Math.floor((new Date(todayStr) - new Date(ds)) / 86400000);
          if (diff === 0) return 'Today';
          if (diff === 1) return 'Yesterday';
          if (diff < 7) return new Date(ds + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short' });
          return new Date(ds + 'T00:00:00').toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
        };

        // Category label map
        const OV_CAT = { grocery:'Groceries', dining:'Dining', restaurant:'Dining', takeaway:'Takeaway', transport:'Transport', health:'Health', subscription:'Subscriptions', shopping:'Shopping', entertainment:'Entertainment', utilities:'Utilities', fuel:'Fuel', insurance:'Insurance', paypal:'PayPal', other:'Other' };
        const ovFmtCat = (c) => OV_CAT[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Other');

        // Deterministic daily insight
        const ovDayHash = parseInt(todayStr.replace(/-/g, '')) % 8;
        const ovInsightPool = [];
        if (isLiveData) {
          if (ovStreak >= 2) ovInsightPool.push(`You've had ${ovStreak} surplus months in a row. That's momentum.`);
          if (healthScore.savingsRate > 0.15) ovInsightPool.push(`Your savings rate would put you in the top 20% of Australians.`);
          const diningCat = ovTopCats.find(c => c.cat === 'dining' || c.cat === 'restaurant');
          if (diningCat) ovInsightPool.push(`Dining is your ${ovTopCats.findIndex(c => c.cat === 'dining' || c.cat === 'restaurant') < 2 ? 'top' : 'fastest-growing'} spending category this month.`);
          if (goals.length > 0 && actualAvgSavings && actualAvgSavings > 0) {
            const g = goals[0];
            const rem = (g.targetAmount || 0) - (g.savedSoFar || 0);
            if (rem > 0) {
              const mo = Math.ceil(rem / actualAvgSavings);
              const projD = new Date(ovNow.getFullYear(), ovMonth + mo, 1);
              ovInsightPool.push(`At this rate, ${g.name} completes around ${projD.toLocaleString('en-AU', { month: 'long', year: 'numeric' })}.`);
            }
          }
          if (liveSunAvg && liveMonAvg && liveMonAvg > 0) {
            const pct = Math.round(Math.abs(liveSunAvg - liveMonAvg) / liveMonAvg * 100);
            if (pct > 10) ovInsightPool.push(`You spend ${pct}% ${liveSunAvg < liveMonAvg ? 'less' : 'more'} on weekends than weekdays this month.`);
          }
        }
        if (ovInsightPool.length === 0) ovInsightPool.push('Upload your bank CSV to unlock personalised insights.');
        const ovDailyInsight = ovInsightPool[ovDayHash % ovInsightPool.length];

        // Closest goal to completion
        const ovClosestGoal = goals.length > 0
          ? goals.reduce((best, g) => {
              const p = g.targetAmount > 0 ? (g.savedSoFar || 0) / g.targetAmount : 0;
              const bp = best.targetAmount > 0 ? (best.savedSoFar || 0) / best.targetAmount : 0;
              return p > bp ? g : best;
            })
          : null;

        // ─── WIDGET ORDER ──────────────────────────────────────────────────
        const ovWidgets = ['cashflow', 'categories', 'networth', 'goals', 'transactions', 'healthscore'];
        if (ovGoalNear) {
          const idx = ovWidgets.indexOf('goals');
          if (idx > 0) { ovWidgets.splice(idx, 1); ovWidgets.unshift('goals'); }
        } else if (uncatCount > 5) {
          const idx = ovWidgets.indexOf('transactions');
          if (idx > 0) { ovWidgets.splice(idx, 1); ovWidgets.unshift('transactions'); }
        } else if (ovNWTrend === 'up' && ovNWChange && ovPrevSnap && ovPrevSnap.netWorth !== 0 && (ovNWChange / Math.abs(ovPrevSnap.netWorth)) > 0.05) {
          const idx = ovWidgets.indexOf('networth');
          if (idx > 0) { ovWidgets.splice(idx, 1); ovWidgets.unshift('networth'); }
        }

        // Widget title style
        const ovTitleStyle = { fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 };

        // ─── HERO CARD ─────────────────────────────────────────────────────
        const heroBase = {
          gridColumn: '1 / -1',
          background: 'rgba(255,255,255,0.03)',
          borderLeft: '3px solid rgba(79,110,247,0.5)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 32,
          // First upload bloom — box-shadow expands then settles
          ...(firstBloom ? { animation: 'bloomBorder 1.2s ease-out both' } : {}),
        };

        const renderHero = () => {
          if (heroPrio === 'noData') {
            const lastFile = uploadedFiles.filter(f => f.status === 'success').at(-1);
            const lastMoLabel = lastFile?.dateRange?.end
              ? new Date(lastFile.dateRange.end).toLocaleString('en-AU', { month: 'long', year: 'numeric' })
              : null;
            return (
              <div style={{ ...heroBase, position: 'relative', overflow: 'hidden' }} className="ov-span3">
                <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', background: 'radial-gradient(ellipse at 20% 50%, rgba(79,110,247,0.03) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(167,139,250,0.03) 0%, transparent 60%)', animation: 'gradMesh 20s ease infinite', backgroundSize: '200% 200%' }} />
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 8 }}>Time for a fresh upload</div>
                {lastMoLabel && <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Your last data is from {lastMoLabel}. Drop in your latest CSV to keep your dashboard current.</div>}
                <button onClick={() => setTab('settings')} style={{ background: 'linear-gradient(135deg,#4f6ef7,#7c3aed)', border: 'none', borderRadius: 10, padding: '10px 22px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Upload CSV</button>
              </div>
            );
          }

          if (heroPrio === 'newMonth' && ovLastMo) {
            const vsNet = ovPrevMo ? ovLastMo.n - ovPrevMo.n : null;
            return (
              <div style={heroBase} className="ov-span3">
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Here's how {ovLastMoName} went</div>
                <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Income', val: ovLastMo.i, color: '#34d399' },
                    { label: 'Spending', val: ovLastMo.s, color: '#f87171' },
                    { label: 'Net', val: ovLastMo.n, color: ovLastMo.n >= 0 ? '#34d399' : '#f87171', signed: true },
                    vsNet !== null ? { label: 'vs prior month', val: vsNet, color: vsNet >= 0 ? '#34d399' : '#f87171', signed: true } : null,
                  ].filter(Boolean).map(({ label, val, color, signed }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>
                        {signed && val >= 0 ? '+' : signed && val < 0 ? '-' : ''}${Math.abs(val).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          if (heroPrio === 'bigSpend') {
            return (
              <div style={heroBase} className="ov-span3">
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                  Busy day — ${ovTodayTotal.toLocaleString()} across {ovTodayTxs.length} transaction{ovTodayTxs.length !== 1 ? 's' : ''} so far
                </div>
                {ovTodayMult && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>That's {ovTodayMult}× your daily average</div>}
                {ovTodayTxs.map((tx, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 5 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>{tx.desc}</span>
                    <span style={{ color: '#f87171', fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>${Math.abs(tx.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            );
          }

          if (heroPrio === 'recurring') {
            const recurringItems = (() => {
              if (!isLiveData) return [];
              const seen = new Set();
              return transactions
                .filter(tx => {
                  if (!tx.date || !tx.amount || tx.amount >= 0) return false;
                  const d = parseInt(tx.date.slice(8, 10));
                  return Math.abs(d - ovDay) <= 1;
                })
                .filter(tx => {
                  const key = (tx.desc || '').toLowerCase().trim().slice(0, 20);
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                })
                .slice(0, 4);
            })();
            const recurringTotal = recurringItems.reduce((s, tx) => s + Math.abs(tx.amount || 0), 0);
            return (
              <div style={heroBase} className="ov-span3">
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Heads up — recurring charges typically hit around today</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>${recurringTotal.toLocaleString()} in recurring charges expected</div>
                {recurringItems.map((tx, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 5 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 12 }}>{tx.desc}</span>
                    <span style={{ color: '#64748b', fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>${Math.abs(tx.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            );
          }

          if (heroPrio === 'goalNear' && ovGoalNear) {
            const pct = Math.round((ovGoalNear.savedSoFar || 0) / ovGoalNear.targetAmount * 100);
            const rem = (ovGoalNear.targetAmount || 0) - (ovGoalNear.savedSoFar || 0);
            return (
              <div style={heroBase} className="ov-span3">
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 10 }}>
                  Almost there — {ovGoalNear.emoji} {ovGoalNear.name} is {pct}% complete
                </div>
                <div style={{ marginBottom: 10, maxWidth: 400 }}>
                  <GoalProgressBar pct={pct} height={8} radius={4} />
                </div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Just ${rem.toLocaleString()} to go</div>
              </div>
            );
          }

          if (heroPrio === 'streak') {
            const streakPnl = pnl.slice(-Math.min(ovStreak, 6));
            const streakMax = Math.max(...streakPnl.map(m => m.n), 1);
            return (
              <div style={heroBase} className="ov-span3">
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>
                  🔥 That's{' '}
                  <span style={{ color: '#a5b4fc', animation: ovStreak % 3 === 0 ? 'streakGlow 600ms ease-in-out' : 'none' }}>{ovStreak}</span>
                  {' '}months in a row with a surplus
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 14 }}>
                  {streakPnl.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 28, borderRadius: 3, background: 'linear-gradient(to top,#4f6ef7,#34d399)', height: Math.max(6, Math.round((m.n / streakMax) * 40)) }} />
                      <span style={{ fontSize: 9, color: '#475569' }}>{m.m}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // Default: "Your month so far"
          const projColor = ovProjected !== null ? (ovProjected >= 0 ? '#34d399' : '#f87171') : '#64748b';
          return (
            <div style={heroBase} className="ov-span3">
              <div style={{ fontSize: 18, fontWeight: 600, color: '#f1f5f9', marginBottom: 16 }}>Your month so far</div>
              <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Income</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}><CountUp end={ovCurIncome} prefix="$" duration={500} color="#34d399" /></div></div>
                <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Spending</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}><CountUp end={currentMonthSpend} prefix="$" duration={500} color="#f87171" /></div></div>
                <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Net</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: ovCurNet >= 0 ? '#34d399' : '#f87171' }}>{ovCurNet >= 0 ? '+' : '-'}<CountUp end={Math.abs(ovCurNet)} prefix="$" duration={500} /></div></div>
                <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Days left</div><div style={{ fontSize: 18, fontWeight: 700, color: '#94a3b8', fontFamily: "'JetBrains Mono',monospace" }}>{ovDaysLeft}</div></div>
                {ovProjected !== null && <div><div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>Projected</div><div style={{ fontSize: 18, fontWeight: 700, color: projColor, fontFamily: "'JetBrains Mono',monospace" }}>{ovProjected >= 0 ? '+' : '-'}<CountUp end={Math.abs(ovProjected)} prefix="$" duration={500} /></div></div>}
              </div>
            </div>
          );
        };

        // ─── WIDGET RENDERERS ──────────────────────────────────────────────
        const renderOvWidget = (id) => {
          if (id === 'cashflow') return (
            <div key="cashflow" className="ov-span2 hover-card" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={ovTitleStyle}>Cash Flow</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  <span style={{ color: '#34d399' }}>${avgMonthlyIncome.toLocaleString()}</span>{' · '}
                  <span style={{ color: '#f87171' }}>${avgMonthlySpend.toLocaleString()}</span>{' · '}
                  <span style={{ color: avgMonthlyNet >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>{avgMonthlyNet >= 0 ? '+' : ''}${avgMonthlyNet.toLocaleString()}</span>
                </div>
              </div>
              <Ch height={160}><ComposedChart data={pnl.map(d => ({ month: d.m, income: d.i, spending: d.s, net: d.n }))} margin={{ top: 4, right: 8, bottom: 2, left: 0 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="income" name="Income" fill="#34d399" radius={[3,3,0,0]} barSize={14} opacity={0.7} animationBegin={0} animationDuration={800} /><Bar dataKey="spending" name="Spending" fill="#f87171" radius={[3,3,0,0]} barSize={14} opacity={0.5} animationBegin={200} animationDuration={800} /><Line dataKey="net" name="Net" stroke="#fbbf24" strokeWidth={2} dot={{ fill: '#fbbf24', r: 2.5 }} /><ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" /></ComposedChart></Ch>
            </div>
          );

          if (id === 'networth') return (
            <div key="networth" className="hover-card" onClick={() => setTab('networth')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, cursor: 'pointer' }}>
              <div style={ovTitleStyle}>Net Worth</div>
              <div className={ovNWChange > 0 ? 'nw-float' : ovNWChange < 0 ? 'nw-sink' : ''} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>
                <CountUp end={ovCurNW} prefix="$" duration={600} />
              </div>
              {ovNWChange !== null && ovPrevNWLabel && (
                <div style={{ fontSize: 11, color: ovNWChange >= 0 ? '#34d399' : '#f87171', marginBottom: 10 }}>
                  {ovNWChange >= 0 ? '↑' : '↓'} ${Math.abs(ovNWChange).toLocaleString()} since {ovPrevNWLabel}
                </div>
              )}
              {nwSnapshots.length < 1 && <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>Save a snapshot to track changes over time</div>}
              {nwSnapshots.length >= 2 && (
                <div style={{ height: 36 }}>
                  <CommaSpark data={nwSnapshots.map(s => ({ day: s.date?.slice(0, 10), cumNet: s.netWorth - nwSnapshots[0].netWorth }))} collapsed={false} />
                </div>
              )}
            </div>
          );

          if (id === 'categories') return (
            <div key="categories" className="hover-card" onClick={() => setTab('categories')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, cursor: 'pointer' }}>
              <div style={ovTitleStyle}>Top Categories</div>
              {ovTopCats.length === 0
                ? <div style={{ fontSize: 12, color: '#475569' }}>Upload CSV to see spending breakdown</div>
                : ovTopCats.map(({ cat, amt }, idx) => {
                    const barOpacity = 1 - (idx / ovTopCats.length) * 0.55;
                    const isUnusual = ovUnusualCat?.name === cat;
                    return (
                      <div key={cat} style={{ marginBottom: 9 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>{ovFmtCat(cat)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {isUnusual && <span style={{ fontSize: 9, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', borderRadius: 4, padding: '1px 4px' }}>↑{ovUnusualCat.change}%</span>}
                            <span style={{ fontSize: 11, color: '#e2e8f0', fontFamily: "'JetBrains Mono',monospace" }}>${amt.toLocaleString()}</span>
                          </div>
                        </div>
                        <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: `rgba(79,110,247,${barOpacity})`, width: `${(amt / ovMaxCat) * 100}%`, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          );

          if (id === 'goals') {
            if (goals.length === 0) return (
              <div key="goals" className="hover-card" onClick={() => setTab('goals')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, cursor: 'pointer' }}>
                <div style={ovTitleStyle}>Goals</div>
                <div style={{ fontSize: 12, color: '#4f6ef7', marginBottom: 6 }}>Set a savings goal →</div>
                <div style={{ fontSize: 11, color: '#334155', lineHeight: 1.5 }}>Goals give your surplus a purpose and keep you motivated month to month.</div>
              </div>
            );
            if (!ovClosestGoal) return null;
            const gPct = ovClosestGoal.targetAmount > 0 ? Math.round((ovClosestGoal.savedSoFar || 0) / ovClosestGoal.targetAmount * 100) : 0;
            const gRem = (ovClosestGoal.targetAmount || 0) - (ovClosestGoal.savedSoFar || 0);
            return (
              <div key="goals" className="hover-card" onClick={() => setTab('goals')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, cursor: 'pointer' }}>
                <div style={ovTitleStyle}>Goal Progress</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>{ovClosestGoal.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ovClosestGoal.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>${(ovClosestGoal.savedSoFar||0).toLocaleString()} / ${(ovClosestGoal.targetAmount||0).toLocaleString()}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#a78bfa', flexShrink: 0 }}>{gPct}%</div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <GoalProgressBar pct={gPct} height={5} radius={3} />
                </div>
                {gRem > 0 && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Just ${gRem.toLocaleString()} to go</div>}
                {goals.length > 1 && <div style={{ fontSize: 11, color: '#4f6ef7' }}>{goals.length - 1} more goal{goals.length > 2 ? 's' : ''} →</div>}
              </div>
            );
          }

          if (id === 'transactions') {
            if (!isLiveData || ovRecentTxs.length === 0) return null;
            return (
              <div key="transactions" className="ov-span2 hover-card" onClick={() => setTab('search')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={ovTitleStyle}>Recent Transactions</div>
                  {uncatCount > 0 && <span style={{ fontSize: 10, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{uncatCount} uncategorised</span>}
                </div>
                {ovRecentTxs.map((tx, i) => (
                  <div key={tx.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, background: i % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                    <span style={{ fontSize: 10, color: '#475569', minWidth: 54, flexShrink: 0 }}>{ovFmtRelDate(tx.date)}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.desc}</span>
                    {tx.cat && tx.cat !== 'other' && <span style={{ fontSize: 9, color: '#4f6ef7', background: 'rgba(79,110,247,0.1)', borderRadius: 10, padding: '1px 6px', flexShrink: 0 }}>{ovFmtCat(tx.cat)}</span>}
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: (tx.amount || 0) >= 0 ? '#34d399' : '#f87171', fontWeight: 600, flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                      {(tx.amount || 0) >= 0 ? '+' : ''}${Math.abs(tx.amount || 0).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            );
          }

          if (id === 'healthscore') return (
            <div key="healthscore" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 16 }}>
              <div style={ovTitleStyle}>Financial Health</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <svg width={64} height={64} viewBox="0 0 80 80">
                    <circle cx={40} cy={40} r={32} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
                    <circle cx={40} cy={40} r={32} fill="none" stroke={healthScore.color} strokeWidth={7}
                      strokeDasharray={`${(healthScore.total / 100) * 201} 201`}
                      strokeLinecap="round" transform="rotate(-90 40 40)" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: healthScore.color, fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{healthScore.total}</div>
                    <div style={{ fontSize: 10, color: '#475569', fontWeight: 600 }}>{healthScore.grade}</div>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {[
                    { label: 'Savings', val: healthScore.s1, max: 35, color: '#34d399' },
                    { label: 'Consistency', val: healthScore.s2, max: 30, color: '#60a5fa' },
                    { label: 'Debt', val: healthScore.s3, max: 20, color: '#a78bfa' },
                    { label: 'Investing', val: healthScore.s4, max: 15, color: '#fbbf24' },
                  ].map(({ label, val, max, color }) => (
                    <div key={label} style={{ marginBottom: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginBottom: 2 }}>
                        <span>{label}</span><span style={{ color }}>{Math.round(val)}/{max}</span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: color, width: `${(val/max)*100}%`, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.55, fontStyle: 'italic', marginBottom: 8, minHeight: 30 }}>
                {userTier === 'free' ? 'Upgrade to Pro for personalised insights' : ovDailyInsight}
              </div>
              <button onClick={(e) => { e.stopPropagation(); setTab('insights'); }} style={{ fontSize: 11, color: '#4f6ef7', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>View full breakdown →</button>
            </div>
          );

          return null;
        };

        if (isMobile) return (
          <MobileOverviewStory
            ovCurNet={ovCurNet}
            ovCurIncome={ovCurIncome}
            currentMonthSpend={currentMonthSpend}
            sparkData={sparkData}
            daysInCurrentMonth={daysInCurrentMonth}
            isAboveAvgPace={isAboveAvgPace}
            todaySpentAmt={todaySpentAmt}
            todayNet={sparkMonthNet}
            ovTopCats={ovTopCats}
            ovFmtCat={ovFmtCat}
            ovRecentTxs={ovRecentTxs}
            ovFmtRelDate={ovFmtRelDate}
            uncatCount={uncatCount}
            ovGoalNear={ovGoalNear}
            isLiveData={isLiveData}
            ovNoCurrentMonth={ovNoCurrentMonth}
            nwSnapshots={nwSnapshots}
            currentMonthPrefix={currentMonthPrefix}
            setTab={setTab}
          />
        );

        return (
          <div className="overview-grid">
            {/* Hero gets entrance index 0 */}
            {(() => { const h = renderHero(); return h ? React.cloneElement(h, { style: { ...h.props.style, ...cardStyle(0) } }) : null; })()}
            {ovWidgets.map((id, idx) => {
              const el = renderOvWidget(id);
              if (!el) return null;
              return React.cloneElement(el, { style: { ...el.props.style, ...cardStyle(idx + 1) } });
            })}
          </div>
        );
      })()}

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
          const row = { id: type + '_' + Date.now(), name: sanitiseUserInput(newBsDraft.name, 100) || (type === 'asset' ? 'Asset' : 'Liability'), value: val, icon: newBsDraft.icon };
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

        const snapshotLimit = userTier === 'free' ? 1 : userTier === 'pro' ? 12 : Infinity;
        const handleSnapshotClick = () => {
          if (isSheetZero) return;
          // Free tier: block saving a 2nd snapshot
          if (!canAccess('nw_timeline') && nwSnapshots.length >= snapshotLimit && !existingThisMonth) {
            setUpgradeOpen(true);
            return;
          }
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
          </div>

          {/* ── Net Worth History Chart ── */}
          {(() => {
            if (nwSnapshots.length === 0) return (
              <div style={{ marginBottom:16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'40px 24px', borderRadius:12, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:32, marginBottom:12, color:'#6b7290', opacity:0.6 }}>📈</div>
                <div style={{ fontSize:15, fontWeight:600, color:'#eef0f6', marginBottom:4, fontFamily:"'DM Sans',sans-serif" }}>No snapshots yet</div>
                <div style={{ fontSize:13, color:'#8b95b8', marginBottom:16, fontFamily:"'DM Sans',sans-serif" }}>Record your assets and debts to track net worth over time</div>
                <button onClick={()=>{ const btn = document.querySelector('[data-save-snapshot]'); if(btn) btn.click(); }} style={{ padding:'8px 20px', borderRadius:8, background:'transparent', border:'1px solid rgba(99,102,241,0.5)', color:'#818cf8', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Save first snapshot →</button>
              </div>
            );
            // Free tier: after 1st snapshot, gate the timeline
            if (!canAccess('nw_timeline')) return (
              <ProBadge feature="Net worth timeline & trend tracking" message="Upgrade to Pro to track your net worth over time" isSignedIn={!!authUser} onUpgrade={() => setUpgradeOpen(true)} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }} />
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
                .map(s => `${sanitiseCSVField(s.date.slice(0,10))},${s.netWorth},${s.totalAssets},${s.totalLiabilities}`);
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

      {/* ═══ CATEGORIES ═══ */}
      {tab === "categories" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Discretionary" value={"$" + DISC.toLocaleString()} accent="#fbbf24" /><St label="Amz+PP" value={"$" + P.amazonRecentAvg} sub="Jan-Feb" accent="#34d399" /></div>
        {/* Time period filter */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "8px 0 4px" }}>
          {[{id:'1mo',l:'This month'},{id:'3mo',l:'Last 3mo'},{id:'6mo',l:'Last 6mo'},{id:'12mo',l:'Last 12mo',pro:true}].map(p => {
            const locked = p.pro && !canAccess('history_12mo');
            return (<button key={p.id} onClick={() => !locked && setCatPeriod(p.id)} style={{ padding:"3px 9px", borderRadius:6, border:"none", cursor:locked?"default":"pointer", fontSize:10, fontWeight:600, fontFamily:"inherit", background:catPeriod===p.id?"rgba(99,102,241,0.22)":"rgba(255,255,255,0.03)", color:catPeriod===p.id?"#a5b4fc":locked?"#334155":"#64748b", opacity:locked?0.5:1 }}>{p.l}{p.pro && <span style={{ marginLeft:3, fontSize:8, color:"#a78bfa" }}>PRO</span>}</button>);
          })}
        </div>
        {/* Payment method filter */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
          {[{id:'all',l:'All'},{id:'card',l:'💳 Card'},{id:'paypal',l:'🅿️ PayPal'},{id:'bnpl',l:'Afterpay/Zip'},{id:'transfer',l:'Transfer'},{id:'cash',l:'Cash'}].map(pm => (
            <button key={pm.id} onClick={() => setCatPayMethod(pm.id)} style={{ padding:"3px 9px", borderRadius:6, border:"none", cursor:"pointer", fontSize:10, fontWeight:600, fontFamily:"inherit", background:catPayMethod===pm.id?"rgba(96,165,250,0.18)":"rgba(255,255,255,0.03)", color:catPayMethod===pm.id?"#93c5fd":"#64748b" }}>{pm.l}</button>
          ))}
        </div>
        {/* Category breakdown */}
        {catData.length === 0 ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'40px 24px' }}>
            <div style={{ fontSize:32, marginBottom:12, color:'#6b7290', opacity:0.6 }}>🔍</div>
            <div style={{ fontSize:15, fontWeight:600, color:'#eef0f6', marginBottom:4, fontFamily:"'DM Sans',sans-serif" }}>No transactions found</div>
            <div style={{ fontSize:13, color:'#8b95b8', fontFamily:"'DM Sans',sans-serif" }}>Try adjusting the period or payment method filter</div>
          </div>
        ) : (() => {
          const maxTotal = catData[0]?.total || 1;
          const CAT_COLORS = {grocery:'#22c55e',grocery_delivery:'#4ade80',restaurant:'#ec4899',takeaway:'#f43f5e',coffee:'#f97316',amazon:'#fb923c',sub:'#6366f1',transport:'#60a5fa',fuel:'#facc15',toll:'#fbbf24',health:'#06b6d4',utilities:'#94a3b8',insurance:'#8b5cf6',personal_care:'#e879f9',education:'#34d399',clothing:'#a78bfa',shopping:'#fb923c',entertainment:'#38bdf8',travel:'#f472b6',other:'#475569'};
          const CAT_LABELS = {grocery:'Groceries',grocery_delivery:'Grocery Delivery',restaurant:'Restaurants',takeaway:'Takeaway',coffee:'Coffee',amazon:'Amazon',sub:'Subscriptions',transport:'Transport',fuel:'Fuel',toll:'Tolls',health:'Health',utilities:'Utilities',insurance:'Insurance',personal_care:'Personal Care',education:'Education',clothing:'Clothing',shopping:'Shopping',entertainment:'Entertainment',travel:'Travel',other:'Other'};
          return (<>
            <Sec icon="📊">Spending by Category</Sec>
            <div style={{ background:"rgba(255,255,255,0.015)", borderRadius:14, border:"1px solid rgba(255,255,255,0.045)", padding:"4px 10px" }}>
              {catData.map((d) => {
                const clr = CAT_COLORS[d.cat] || '#475569';
                const label = CAT_LABELS[d.cat] || d.cat;
                const isExp = catExpanded === d.cat;
                return (<div key={d.cat}>
                  <div onClick={() => setCatExpanded(isExp ? null : d.cat)} style={{ cursor:"pointer", padding:"7px 0" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:5 }}>
                      <div style={{ width:6, height:6, borderRadius:"50%", background:clr, flexShrink:0 }} />
                      <span style={{ fontSize:11, color:"#e2e8f0", flex:1 }}>{label}</span>
                      {d.mom !== null && (<span style={{ fontSize:9, fontWeight:700, color:d.mom > 0?"#f87171":"#34d399" }}>{d.mom > 0 ? "↑" : "↓"}{Math.abs(d.mom)}%</span>)}
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#cbd5e1" }}>${d.total.toLocaleString()}</span>
                      <span style={{ fontSize:8, color:"#475569" }}>{isExp?"▲":"▼"}</span>
                    </div>
                    <div style={{ height:5, background:"rgba(255,255,255,0.04)", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ width:`${(d.total/maxTotal)*100}%`, height:"100%", background:clr, borderRadius:3, opacity:0.65 }} />
                    </div>
                  </div>
                  {isExp && (<div style={{ padding:"4px 0 8px 13px", marginBottom:2 }}>
                    {d.tops.length === 0
                      ? <span style={{ fontSize:10, color:"#475569" }}>No merchant data</span>
                      : d.tops.map((m, mi) => (<div key={mi} style={{ display:"flex", justifyContent:"space-between", padding:"2px 0", borderBottom:mi < d.tops.length-1?"1px solid rgba(255,255,255,0.02)":"none" }}>
                          <span style={{ fontSize:10, color:"#94a3b8", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.desc}</span>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#cbd5e1", marginLeft:8 }}>${m.amt.toLocaleString()}</span>
                        </div>))}
                  </div>)}
                </div>);
              })}
            </div>
          </>);
        })()}
        {/* Food & Amazon charts (from Variable tab) */}
        <Sec icon="🍔">{`Food ($${P.foodMonthlyBudget}/mo)`}</Sec>
        <Ch height={180}><BarChart data={food.map(d => ({ month: d.m, restaurants: d.r, takeaway: d.t, groceries: d.g }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="restaurants" name="Restaurants" stackId="a" fill="#ec4899" barSize={22} animationBegin={0} animationDuration={800} /><Bar dataKey="takeaway" name="Takeaway" stackId="a" fill="#f43f5e" barSize={22} animationBegin={100} animationDuration={800} /><Bar dataKey="groceries" name="Groceries" stackId="a" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={22} animationBegin={200} animationDuration={800} /></BarChart></Ch>
        <Sec icon="📦">{`Amazon ($${P.amazonRecentAvg} recent)`}</Sec>
        <Ch height={150}><BarChart data={amz.map(d => ({ month: d.m, amount: d.v }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="amount" name="Amazon" fill="#f97316" radius={[4, 4, 0, 0]} barSize={26} /></BarChart></Ch>
      </div>)}


      {/* ═══ SAVINGS ═══ */}
      {tab === "savings" && (<div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><St label="Drawn" value={"$" + P.savingsDrawn.toLocaleString()} accent="#f87171" /><St label="Avg" value={"$" + P.savingsMonthlyAvg.toLocaleString()} sub="/mo" accent="#fbbf24" /></div>
        <Sec icon="📊">By Source</Sec>
        <Ch height={190}><BarChart data={sdr.map(d => ({ month: d.m, Investment: d.inv, Savings: d.sav, Other: d.oth }))} margin={{ top: 5, right: 12, bottom: 5, left: 4 }}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="Investment" stackId="a" fill="#f87171" barSize={22} animationBegin={0} animationDuration={800} /><Bar dataKey="Savings" stackId="a" fill="#fbbf24" barSize={22} animationBegin={100} animationDuration={800} /><Bar dataKey="Other" stackId="a" fill="#60a5fa" radius={[3, 3, 0, 0]} barSize={22} animationBegin={200} animationDuration={800} /></BarChart></Ch>
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
        {!canAccess('deep_dive_history') && (
          <ProBadge feature="Historical analysis — 6+ month velocity & compound cost" message="Upgrade to Pro for historical analysis" isSignedIn={!!authUser} onUpgrade={() => setUpgradeOpen(true)} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }} />
        )}
      </div>)}

      {/* ═══ TREND ═══ */}
      {tab === "trend" && (<div>
        {!canAccess('trend_tab') ? (
          <div style={{ position:'relative' }}>
            <div style={{ filter:'blur(3px)', pointerEvents:'none', userSelect:'none', opacity:0.35 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <St label="8-Mo Deficit" value={"-$" + DEMO_DATA.trendStats.deficit8mo.toLocaleString()} accent="#f87171" />
                <St label="Forward" value={"+" + "$" + DEMO_DATA.trendStats.forward} accent="#34d399" />
              </div>
              <Sec icon="📉">Amazon + PayPal</Sec>
              <Ch height={190}><BarChart data={cd.map(d => ({ month: d.m, Amazon: d.a, PayPal: d.p }))}>{gd}<XAxis dataKey="month" {...xP} /><YAxis {...yP} /><Tooltip content={<Tip />} /><Bar dataKey="Amazon" stackId="a" fill="#f97316" barSize={24} /><Bar dataKey="PayPal" stackId="a" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={24} /></BarChart></Ch>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                <div style={{ padding: 12, borderRadius: 10, background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.08)" }}><div style={{ fontSize: 9, color: "#f87171", textTransform: "uppercase", fontWeight: 700 }}>Jul—Dec</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: "#f87171" }}>{"$" + DEMO_DATA.trendStats.julDec.toLocaleString()}</div></div>
                <div style={{ padding: 12, borderRadius: 10, background: "rgba(52,211,153,0.04)", border: "1px solid rgba(52,211,153,0.08)" }}><div style={{ fontSize: 9, color: "#34d399", textTransform: "uppercase", fontWeight: 700 }}>Jan—Feb</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: "#34d399" }}>{"$" + DEMO_DATA.trendStats.janFeb}</div></div>
              </div>
            </div>
            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'0 16px' }}>
              <ProBadge feature="Trend analysis — multi-month spending patterns" message="Upgrade to Pro for month-over-month spending analysis" isSignedIn={!!authUser} onUpgrade={() => setUpgradeOpen(true)} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }} />
            </div>
          </div>
        ) : (<>
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

      {/* ═══ SUBSCRIPTIONS ═══ */}
      {/* TODO: Auto-detect recurring charges from transaction data instead of hardcoded lists */}
      {tab === "subscriptions" && (<div>
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
            {!canAccess('goal_projections') ? (
              <ProBadge feature="Goal projections & completion dates" message="Upgrade to Pro to see projected completion dates" isSignedIn={!!authUser} onUpgrade={() => setUpgradeOpen(true)} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }} />
            ) : plan.surplus <= 0 && !hasActualData ? (
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
            )}
          </div>
        )}

        {/* Empty state */}
        {goals.length===0 && !showGoalForm && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'48px 24px' }}>
            <div style={{ fontSize:32, marginBottom:12, color:'#6b7290', opacity:0.6 }}>🎯</div>
            <div style={{ fontSize:15, fontWeight:600, color:'#eef0f6', marginBottom:4, fontFamily:"'DM Sans',sans-serif" }}>No goals yet</div>
            <div style={{ fontSize:13, color:'#8b95b8', marginBottom:16, fontFamily:"'DM Sans',sans-serif" }}>Set a savings target and track your progress</div>
            <button onClick={()=>setShowGoalForm(true)} style={{ padding:'8px 20px', borderRadius:8, background:'transparent', border:'1px solid rgba(99,102,241,0.5)', color:'#818cf8', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', marginBottom:24 }}>Create a goal →</button>
            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
              {GOAL_TEMPLATES.map(t=>(
                <button key={t.name} onClick={()=>applyGoalTpl(t)}
                  style={{ background:'rgba(79,110,247,0.08)', border:'1px solid rgba(79,110,247,0.2)', borderRadius:10, padding:'10px 16px', color:'#a5b4fc', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Goal cards */}
        {goals.map((g, gi)=>{
          const pct = g.targetAmount>0 ? Math.min(100,Math.max(0,Math.round((g.savedSoFar/g.targetAmount)*100))) : 0;
          const proj = goalProjDate(g);
          const isDeleting = deletingGoalId===g.id;
          return (
            <div key={g.id} style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:14, padding:'14px 16px', marginBottom:10, position:'relative', overflow:'visible', ...cardStyle(gi + 1) }}>
              {pct >= 100 && <GoalConfetti goalId={g.id} />}
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
                <GoalProgressBar pct={pct} height={8} radius={4} />
                <span style={{ fontSize:11, color:'#64748b', fontFamily:"'JetBrains Mono',monospace", minWidth:32, textAlign:'right' }}>{pct}%</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#64748b', marginBottom:4 }}>
                <span>${(g.savedSoFar||0).toLocaleString()} saved of ${(g.targetAmount||0).toLocaleString()}</span>
                <span>{pct}% complete</span>
              </div>
              <div style={{ fontSize:11, color:'#475569' }}>
                {canAccess('goal_projections') ? (
                  proj.startsWith('Plan:') ? proj : <>Projected: <span style={{ color:proj==='Complete'?'#34d399':proj.includes('Increase')?'#f87171':'#94a3b8' }}>{proj}</span></>
                ) : (
                  <>Projected: <span onClick={() => setUpgradeOpen(true)} style={{ cursor:'pointer', padding:'1px 7px', borderRadius:20, background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.25)', color:'#fbbf24', fontSize:10, fontWeight:700 }}>Pro</span></>
                )}
                {g.targetDate && <span style={{ marginLeft:8, color:'#334155' }}>· Target: {goalFmtDate(g.targetDate)}</span>}
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
                  style={{ background:'rgba(79,110,247,0.05)', border:'1px solid rgba(79,110,247,0.14)', borderRadius:8, padding:'5px 11px', color:'#818cf8', fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit' }}>
                  {t.emoji} {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add Goal button */}
        {!showGoalForm && (
          <button onClick={()=>{setEditingGoalId(null);setGoalDraft({emoji:'🎯',name:'',targetAmount:'',targetDate:'',savedSoFar:'0'});setShowGoalForm(true);}}
            style={{ width:'100%', padding:'9px 0', borderRadius:10, background:'rgba(79,110,247,0.09)', border:'1px solid rgba(79,110,247,0.2)', color:'#818cf8', fontSize:13, fontWeight:600, cursor:'pointer', marginTop:4, fontFamily:'inherit' }}>
            + Add Goal
          </button>
        )}

        {/* Add / Edit form */}
        {showGoalForm && (
          <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:14, padding:16, marginTop:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}><h2 style={{ margin:0, fontSize:14, fontWeight:700, color:'#e2e8f0' }}>{editingGoalId ? 'Edit Goal' : 'New Goal'}</h2><div style={{ flex:1, height:1, background:'linear-gradient(90deg,rgba(255,255,255,0.07),transparent)' }}/></div>
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
              <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px', color:'#e2e8f0', fontSize:13, fontFamily:'inherit', width:'100%', boxSizing:'border-box', outline:'none' }}
                placeholder="e.g. House Deposit" aria-label="Goal name" value={goalDraft.name} onChange={e=>setGoalDraft(d=>({...d,name:e.target.value}))} />
            </div>
            {/* Target + Saved */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Target Amount</div>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#64748b', fontSize:13, pointerEvents:'none' }}>$</span>
                  <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px 7px 22px', color:'#e2e8f0', fontSize:13, fontFamily:"'JetBrains Mono',monospace", width:'100%', boxSizing:'border-box', outline:'none' }}
                    type="number" placeholder="60000" value={goalDraft.targetAmount} onChange={e=>setGoalDraft(d=>({...d,targetAmount:e.target.value}))} />
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Saved So Far</div>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#64748b', fontSize:13, pointerEvents:'none' }}>$</span>
                  <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px 7px 22px', color:'#e2e8f0', fontSize:13, fontFamily:"'JetBrains Mono',monospace", width:'100%', boxSizing:'border-box', outline:'none' }}
                    type="number" placeholder="0" value={goalDraft.savedSoFar} onChange={e=>setGoalDraft(d=>({...d,savedSoFar:e.target.value}))} />
                </div>
              </div>
            </div>
            {/* Target date */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Target Date</div>
              <input style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'7px 11px', color:'#e2e8f0', fontSize:13, fontFamily:'inherit', width:'100%', boxSizing:'border-box', outline:'none', colorScheme:'dark' }}
                type="date" value={goalDraft.targetDate} onChange={e=>setGoalDraft(d=>({...d,targetDate:e.target.value}))} />
            </div>
            {/* Validation error */}
            {goalError && <div style={{ fontSize:12, color:'#f5455c', marginBottom:8 }}>{goalError}</div>}
            {/* Buttons */}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveGoalDraft} style={{ flex:1, padding:'8px 0', borderRadius:9, background:'rgba(52,211,153,0.1)', border:'1px solid rgba(52,211,153,0.25)', color:'#34d399', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Save Goal</button>
              <button onClick={cancelGoalForm} style={{ padding:'8px 16px', borderRadius:9, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#64748b', fontSize:13, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
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
        <Note color="#fbbf24"><span style={{ color: "#fbbf24", fontWeight: 700 }}>2024-25 rates (Stage 3). </span>Includes LITO offset. Assumes no deductions or super adjustments. This is an estimate only and does not constitute tax advice. Consult a registered tax agent.</Note>
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
            {!canAccess('history_12mo') && (
              <ProBadge feature="12 months of spending patterns" message="Upgrade to Pro for 12 months of spending patterns" isSignedIn={!!authUser} onUpgrade={() => setUpgradeOpen(true)} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }} />
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
          const { cat, editPattern } = pendingRule;
          const count = transactions.filter(t => t.desc.toLowerCase().includes(editPattern.toLowerCase())).length;
          addUserRule(editPattern, cat);
          const isFirst = !firstRecatDone;
          if (isFirst) {
            setFirstRecatDone(true);
            try { localStorage.setItem('comma_first_recat_done', 'true'); } catch {}
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

          <input
            type="text" placeholder="Search transactions…" value={searchQuery}
            aria-label="Search transactions"
            onChange={e => setSearchQuery(e.target.value)}
            onClick={e => e.stopPropagation()}
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", outline: "none", marginBottom: 10 }}
          />

          {/* Filter pills */}
          <div className="cat-filter-wrap">
          <div className="cat-filter-row">
            {['all','grocery','restaurant','takeaway','coffee','delivery','alcohol','transport','fuel','toll','parking','car','home','utilities','telco','insurance','health','fitness','personal_care','clothing','education','school','childcare','kids','sub','bnpl','gifts','charity','strata','travel','gambling','cash','government','mortgage','rent','transfer'].filter(cat => cat === 'all' || !preferences.hiddenCategories.includes(cat)).map(cat => (
              <button key={cat} onClick={e => { e.stopPropagation(); setSearchCat(cat); }}
                style={{ padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
                  background: searchCat === cat ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.05)",
                  color: searchCat === cat ? "#93c5fd" : "#64748b" }}>
                {cat === 'all' ? 'All' : cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
            <button onClick={e => { e.stopPropagation(); setSearchCat(searchCat === 'other' ? 'all' : 'other'); }}
              style={{ padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap",
                background: searchCat === 'other' ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.05)",
                color: searchCat === 'other' ? "#f87171" : "#64748b" }}>
              Uncategorised
            </button>
          </div>
          </div>

          {/* Uncategorised helper hint */}
          {searchCat === 'other' && filteredTxs.length > 0 && Object.keys(userRules).length < 3 && (
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.08)" }}>
              <strong style={{ color: "#f87171" }}>{filteredTxs.length}</strong> uncategorised transactions. Tap any category pill to teach Comma — it remembers for next time.
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
                            {ALL_CATS.filter(cat => !preferences.hiddenCategories.includes(cat)).map(cat => {
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
          {!canAccess('history_12mo') && (
            <ProBadge feature="Search 12 months of transactions" message="Upgrade to Pro to search across 12 months" isSignedIn={!!authUser} onUpgrade={() => setUpgradeOpen(true)} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }} />
          )}
        </div>
        );
      })()}


      {/* ═══ SETTINGS ═══ */}
      {tab === "settings" && (<div>

        {/* ── Settings mini-nav ── */}
        <div style={{
          position: 'sticky',
          top: 56,
          zIndex: 44,
          background: '#0b0b17',
          marginLeft: sidebarHidden ? -16 : -24,
          marginRight: sidebarHidden ? -16 : -24,
          paddingLeft: sidebarHidden ? 16 : 24,
          paddingRight: sidebarHidden ? 16 : 24,
          paddingTop: 10,
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          marginBottom: 32,
        }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
            {[
              { id: 'data',        icon: '📁', label: 'Data' },
              { id: 'categories',  icon: '🏷️', label: 'Categories' },
              { id: 'preferences', icon: '⚙️', label: 'Preferences' },
              { id: 'ai',          icon: '🤖', label: 'AI' },
              { id: 'account',     icon: '👤', label: 'Account' },
              { id: 'about',       icon: 'ℹ️', label: 'About' },
            ].map(s => {
              const active = settingsActiveSection === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSettingsActiveSection(s.id);
                    settingsSectionRefs.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{
                    flexShrink: 0,
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: `1px solid ${active ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.07)'}`,
                    background: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.03)',
                    color: active ? '#818cf8' : '#64748b',
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >{s.icon} {s.label}</button>
              );
            })}
          </div>
        </div>

        {/* ══ Section: Data ══ */}
        <div ref={el => { settingsSectionRefs.current['data'] = el; }} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>📁 Data</div>
            <div style={{ fontSize: 11, color: '#6b7290', lineHeight: 1.6 }}>Upload your bank CSV files to see your real figures across all tabs.</div>
          </div>

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
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 32 }} />

        {/* ══ Section: Categories ══ */}
        <div ref={el => { settingsSectionRefs.current['categories'] = el; }} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>🏷️ Categories</div>
            <div style={{ fontSize: 11, color: '#6b7290', lineHeight: 1.6 }}>Custom rules to override how Comma categorises your merchants.</div>
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
                    const sanitised = Object.fromEntries(
                      Object.entries(incoming)
                        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
                        .map(([k, v]) => [sanitiseUserInput(k, 200), v])
                    );
                    const added = Object.entries(sanitised).filter(([k]) => !(k in userRules)).length;
                    setUserRules(prev => ({ ...sanitised, ...prev })); // existing rules win on conflict
                    setImportRulesStatus({ ok: true, msg: `Imported ${added} new rule${added !== 1 ? 's' : ''} (${Object.keys(sanitised).length - added} skipped — already exist)` });
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

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 32 }} />

        {/* ══ Section: Preferences ══ */}
        {(() => {
          const prefGroups = [
            { label: 'Family',    cats: ['childcare', 'school', 'kids'] },
            { label: 'Property',  cats: ['strata', 'mortgage', 'rent'] },
            { label: 'Sensitive', cats: ['gambling', 'bnpl'] },
            { label: 'Lifestyle', cats: ['alcohol', 'personal_care', 'pets'] },
          ];
          const catTxCounts = prefGroups.flatMap(g => g.cats).reduce((acc, cat) => {
            acc[cat] = transactions.filter(tx => tx.cat === cat).length;
            return acc;
          }, {});
          const catLabel = cat => cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return (
            <div ref={el => { settingsSectionRefs.current['preferences'] = el; }} style={{ marginBottom: 32 }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>⚙️ Preferences</div>
                <div style={{ fontSize: 11, color: '#6b7290', lineHeight: 1.6 }}>Customise which categories and features appear in your dashboard.</div>
              </div>

              {/* Category Visibility */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Category Visibility</div>
                  <button
                    onClick={() => {
                      const zeroCats = prefGroups.flatMap(g => g.cats).filter(cat => catTxCounts[cat] === 0 && !preferences.hiddenCategories.includes(cat));
                      if (zeroCats.length > 0) {
                        setPreferences(prev => ({ ...prev, hiddenCategories: [...new Set([...prev.hiddenCategories, ...zeroCats])] }));
                      }
                    }}
                    style={{ fontSize: 10, padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                  >Recommended for me</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {prefGroups.map(group => (
                    <div key={group.label} style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{group.label}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {group.cats.map(cat => {
                          const isVisible = !preferences.hiddenCategories.includes(cat);
                          const count = catTxCounts[cat];
                          const color = CAT_COLORS[cat] || CAT_COLORS.other;
                          return (
                            <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 500 }}>{catLabel(cat)}</span>
                                {count > 0 && (
                                  <span style={{ fontSize: 10, color: color, background: `${color}18`, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>{count} tx</span>
                                )}
                                {count === 0 && transactions.length > 0 && (
                                  <span style={{ fontSize: 10, color: '#334155' }}>no transactions</span>
                                )}
                              </div>
                              <div
                                onClick={() => toggleHiddenCat(cat)}
                                style={{
                                  width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                                  background: isVisible ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.07)',
                                  border: `1px solid ${isVisible ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                  position: 'relative', flexShrink: 0, transition: 'all 0.2s',
                                }}
                              >
                                <div style={{
                                  width: 14, height: 14, borderRadius: '50%',
                                  background: isVisible ? '#60a5fa' : '#334155',
                                  position: 'absolute', top: 2, left: isVisible ? 18 : 2,
                                  transition: 'all 0.2s',
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Display Preferences */}
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Display</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Show cents */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#cbd5e1' }}>Show cents</span>
                    <div
                      onClick={() => setPreferences(prev => ({ ...prev, showCents: !prev.showCents }))}
                      style={{
                        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                        background: preferences.showCents ? 'rgba(96,165,250,0.35)' : 'rgba(255,255,255,0.07)',
                        border: `1px solid ${preferences.showCents ? 'rgba(96,165,250,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        position: 'relative', flexShrink: 0, transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ width: 14, height: 14, borderRadius: '50%', background: preferences.showCents ? '#60a5fa' : '#334155', position: 'absolute', top: 2, left: preferences.showCents ? 18 : 2, transition: 'all 0.2s' }} />
                    </div>
                  </div>
                  {/* Week starts on */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#cbd5e1' }}>Week starts on</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['monday', 'sunday'].map(day => (
                        <button
                          key={day}
                          onClick={() => setPreferences(prev => ({ ...prev, weekStart: day }))}
                          style={{ padding: '3px 10px', borderRadius: 8, border: `1px solid ${preferences.weekStart === day ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.07)'}`, background: preferences.weekStart === day ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)', color: preferences.weekStart === day ? '#93c5fd' : '#64748b', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}
                        >{day}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Reset to defaults */}
              <button
                onClick={() => setPreferences(DEFAULT_PREFERENCES)}
                style={{ width: '100%', padding: '9px 0', borderRadius: 9, border: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', color: '#475569', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
              >Reset to defaults</button>
            </div>
          );
        })()}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 32 }} />

        {/* ══ Section: AI Insights ══ */}
        <div ref={el => { settingsSectionRefs.current['ai'] = el; }} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>🤖 AI Insights</div>
            <div style={{ fontSize: 11, color: '#6b7290', lineHeight: 1.6 }}>Connect your preferred AI provider for personalised financial insights. Your data goes directly from your browser to your AI — Comma is never in the loop.</div>
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

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 32 }} />

        {/* ══ Section: Account ══ */}
        <div ref={el => { settingsSectionRefs.current['account'] = el; }} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>👤 Account</div>
            <div style={{ fontSize: 11, color: '#6b7290', lineHeight: 1.6 }}>Sign in to sync your data across devices with end-to-end encryption.</div>
          </div>

          <AuthSection
            authUser={authUser}
            userTier={userTier}
            authView={authView}
            authLoading={authLoading}
            authError={authError}
            authSuccess={authSuccess}
            lastSynced={lastSynced}
            syncStatus={syncStatus}
            showForgotPw={showForgotPw}
            onSetAuthView={v => { setAuthView(v); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }}
            onSignUp={handleAuthSignUp}
            onSignIn={handleAuthSignIn}
            onSignOut={handleAuthSignOut}
            onSyncNow={handleSyncNow}
            onSetShowForgotPw={setShowForgotPw}
            onChangePassword={handleChangePassword}
          />

          {userTier === 'free' && (
            <ProBadge feature="Encrypted cloud sync" message="Upgrade to Pro for encrypted cloud sync across devices" isSignedIn={!!authUser} onUpgrade={() => setUpgradeOpen(true)} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); }} />
          )}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginBottom: 32 }} />

        {/* ══ Section: About ══ */}
        <div ref={el => { settingsSectionRefs.current['about'] = el; }} style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>ℹ️ About</div>
            <div style={{ fontSize: 11, color: '#6b7290', lineHeight: 1.6 }}>Comma v0.5.0 — Personal finance dashboard for Australian households.</div>
          </div>

          {/* Disclaimer */}
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: '#475569', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Financial Disclaimer</div>
            <p style={{ margin: 0, fontSize: 11, color: '#6b7290', lineHeight: 1.7 }}>
              Comma is a financial dashboard tool, not a licensed financial adviser. All information, calculations, and AI-generated insights are for personal informational use only and do not constitute financial, tax, or investment advice. Consult a qualified professional for decisions about your specific financial situation.
            </p>
          </div>

          {/* Links */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
            {[
              { label: 'Privacy Policy' },
              { label: 'Terms of Use' },
              { label: 'Help Centre' },
              { label: 'Changelog' },
            ].map(link => (
              <a
                key={link.label}
                href="#"
                onClick={e => e.preventDefault()}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderRadius: 9, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#64748b', fontSize: 12, textDecoration: 'none' }}
              >
                <span>{link.label}</span>
                <span style={{ fontSize: 10, opacity: 0.4 }}>↗</span>
              </a>
            ))}
          </div>

          {/* Made in Melbourne */}
          <div style={{ textAlign: 'center', fontSize: 11, color: '#334155', paddingTop: 4 }}>
            Made in Melbourne 🇦🇺
          </div>
        </div>

      </div>)}

      <div style={{ marginTop: 32, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.03)", textAlign: "center" }}><div style={{ color: "#1e293b", fontSize: 9 }}>Up Bank + PayPal + Gateway + CommSec</div></div>

      {/* Print-only footer */}
      <div className="print-footer">
        Generated by Comma · {new Date().toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})} · getcomma.com.au
      </div>
      </div>{/* end tab content wrapper */}
      </main>{/* end main content */}

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

      {/* ═══ AI CHAT FAB + FLOATING PANEL ═══ */}
      <style>{`
        @keyframes chatDot { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }
        @keyframes fabPulse { 0%{box-shadow:0 4px 20px rgba(79,110,247,0.3)} 50%{box-shadow:0 4px 32px rgba(79,110,247,0.65),0 0 0 8px rgba(79,110,247,0.12)} 100%{box-shadow:0 4px 20px rgba(79,110,247,0.3)} }
        @keyframes syncPulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
        @keyframes slideUpBar { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        .sync-syncing { animation: syncPulse 1.4s ease-in-out infinite; }
        .chat-fab { animation: fabPulse 2s ease-in-out 3; }
        .chat-fab:hover { transform: scale(1.08) !important; }
      `}</style>

      {/* Floating chat panel */}
      {chatOpen && (
        <div className="chat-panel-float"
          onClick={e => { if (e.target === e.currentTarget) { setChatOpen(false); } }}
          style={{
            position: 'fixed',
            top: isMobile ? undefined : 64,
            bottom: isMobile ? 0 : undefined,
            right: isMobile ? 0 : 24,
            width: isMobile ? '100vw' : 400,
            height: isMobile ? '95vh' : undefined,
            maxHeight: isMobile ? '95vh' : 'calc(100vh - 80px)',
            background: '#0c0e1a',
            borderRadius: isMobile ? '16px 16px 0 0' : 16,
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Panel header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', background: 'rgba(255,255,255,0.03)',
            borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>AI Insights</span>
              {aiKey && (
                <span style={{ fontSize: 10, color: '#475569', padding: '1px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {AI_PROVIDERS[aiProvider]?.sub || AI_PROVIDERS[aiProvider]?.label}
                  {isLiveData && <span style={{ marginLeft: 5, color: '#34d399' }}>● live</span>}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {chatMessages.length > 0 && (
                <button onClick={() => { setChatMessages([]); setChatSuggestions([]); }} style={{ padding: '3px 8px', borderRadius: 6, background: 'none', border: '1px solid rgba(255,255,255,0.07)', color: '#475569', fontSize: 10, cursor: 'pointer' }}>Clear</button>
              )}
              <button onClick={() => setChatOpen(false)} style={{ background: 'none', border: 'none', color: '#475569', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>✕</button>
            </div>
          </div>

          {/* Panel body */}
          {!canAccess('ai_chat') ? (
            /* ── Free/unauthenticated teaser ── */
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>AI-Powered Financial Insights</div>
                <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.7, maxWidth: 300, margin: '0 auto' }}>Ask questions about your spending, get personalised advice, and spot patterns you'd miss.</div>
              </div>
              {/* Static example exchange */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
                {[
                  { role: 'user', text: 'What did I spend the most on last month?' },
                  { role: 'assistant', text: 'Groceries at $847, up 12% from the month before. The Harris Farm weekend shops are the main driver.' },
                  { role: 'user', text: 'How can I hit my house deposit goal faster?' },
                  { role: 'assistant', text: "At your current savings rate of $1,200/month, you'll reach $60K in 28 months. Cutting dining out by 30% would shave 4 months off." },
                ].map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '85%', padding: '8px 12px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: m.role === 'user' ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)', border: m.role === 'user' ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#94a3b8', lineHeight: 1.6, opacity: 0.75 }}>{m.text}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: '#334155', marginTop: 2 }}>Works with Claude, ChatGPT, or Gemini — bring your own API key.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <ProBadge feature="AI-powered financial chat" message="Upgrade to Pro for AI-powered insights" isSignedIn={!!authUser} onUpgrade={() => { setUpgradeOpen(true); setChatOpen(false); }} onSignIn={() => { setTab('settings'); setAuthView('signup'); setAuthError(''); setAuthSuccess(''); setShowForgotPw(false); setChatOpen(false); }} />
                <button onClick={() => { setTab('settings'); setChatOpen(false); }} style={{ padding: '8px 0', borderRadius: 10, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Set up AI in Settings →</button>
              </div>
            </div>
          ) : !aiKey ? (
            /* ── No API key ── */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, padding: 28, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12, color: '#6b7290', opacity: 0.6 }}>🤖</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#eef0f6', marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>AI insights not configured</div>
              <div style={{ fontSize: 13, color: '#8b95b8', maxWidth: 240, lineHeight: 1.6, marginBottom: 16, fontFamily: "'DM Sans',sans-serif" }}>Add your API key in Settings to chat with your financial data</div>
              <button onClick={() => { setTab('settings'); setChatOpen(false); }} style={{ padding: '8px 20px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(99,102,241,0.5)', color: '#818cf8', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Set up AI →</button>
            </div>
          ) : (<>
            {/* Quick action pills */}
            <div style={{ display: 'flex', gap: 6, padding: '8px 12px 0', flexShrink: 0, flexWrap: 'wrap' }}>
              {[
                { label: '📊 Summarise my month', prompt: 'Give me a concise monthly summary of my finances. Include: total income, total spending, savings rate, top 3 spending categories, and one thing I should consider changing.' },
                { label: '🏠 Cost of living check', prompt: 'Compare my spending to typical Australian benchmarks. Am I above or below average on groceries, dining, transport, and utilities? Use ABS data as a rough guide.' },
              ].map(({ label, prompt }) => (
                <button key={label} onClick={() => sendChatMessage(prompt)} disabled={chatStreaming}
                  style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8', fontSize: 10, cursor: chatStreaming ? 'default' : 'pointer', opacity: chatStreaming ? 0.5 : 1, fontWeight: 500, whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { if (!chatStreaming) e.currentTarget.style.background = 'rgba(99,102,241,0.16)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.08)'; }}
                >{label}</button>
              ))}
            </div>

            {/* Message area */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px' }}>
              {chatMessages.length === 0 && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 16 }}>
                  <div style={{ fontSize: 28, opacity: 0.4 }}>💬</div>
                  <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', maxWidth: 240, lineHeight: 1.7 }}>Ask anything about your finances — spending patterns, saving tips, mortgage analysis, budget advice.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
                    {[
                      'What did I spend the most on last month?',
                      'How can I improve my savings rate?',
                      'Are there any spending patterns I should worry about?',
                    ].map(prompt => (
                      <button key={prompt} onClick={() => sendChatMessage(prompt)}
                        style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 11, cursor: 'pointer', textAlign: 'left', lineHeight: 1.4 }}
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
                          {msg.text.split('\n').map((line, li) => renderChatLine(line, li))}
                          {msg.action && <button onClick={() => { setTab(msg.action.tab); setChatOpen(false); }} style={{ marginTop: 8, padding: '5px 10px', borderRadius: 7, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.25)', color: '#fca5a5', fontSize: 11, cursor: 'pointer', display: 'block' }}>{msg.action.label}</button>}
                        </>) : msg.text}
                      </div>
                    </div>
                    {isLastAssistant && chatSuggestions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, paddingLeft: 4 }}>
                        {chatSuggestions.map(s => (
                          <button key={s} onClick={() => { setChatSuggestions([]); sendChatMessage(s); }}
                            style={{ padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}
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
            <div style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
              <div style={{ textAlign: 'center', fontSize: 10, color: '#6b7290', marginBottom: 6 }}>AI responses are general only — not financial advice.</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                  disabled={chatStreaming}
                  placeholder="Ask about your finances…"
                  maxLength={2000}
                  rows={1}
                  style={{
                    flex: 1, resize: 'none', maxHeight: 72, overflowY: 'auto',
                    padding: '9px 12px', borderRadius: 12,
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
                    padding: '9px 13px', borderRadius: 12, flexShrink: 0,
                    background: chatStreaming || !chatInput.trim() ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.25)',
                    border: '1px solid rgba(99,102,241,0.3)',
                    color: chatStreaming || !chatInput.trim() ? '#475569' : '#818cf8',
                    fontSize: 16, cursor: chatStreaming || !chatInput.trim() ? 'default' : 'pointer', lineHeight: 1,
                  }}
                >↑</button>
              </div>
            </div>
          </>)}
        </div>
      )}
    </div>
    </>
  );
}

export default function Dashboard() {
  return <DashboardInner />;
}
