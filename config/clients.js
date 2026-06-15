// ============================================================
// config/clients.js
// Daftar client dan konfigurasi Meta Ad Account masing-masing
// Edit file ini untuk menambah/mengubah client
// ============================================================

const clients = [
  {
    id: 1,
    name: "PT Sejahtera Digital",
    industry: "E-Commerce",
    pic: "Budi Santoso",
    budgetPerMonth: 15000000,
    metaAdAccountId: "act_112233445",   // Ganti dengan ID asli
    status: "Active",
    kpiTargets: {
      roas: 4.0,          // Return on Ad Spend minimum
      cpl: 25000,         // Cost per Lead maksimum (Rp)
      ctr: 2.5,           // Click Through Rate minimum (%)
      leadsPerMonth: 200, // Target leads per bulan
      impressions: 500000,// Target impressions per bulan
      frequency: 3.0      // Frequency maksimum
    }
  },
  {
    id: 2,
    name: "WarungKita F&B",
    industry: "F&B",
    pic: "Siti Rahma",
    budgetPerMonth: 8000000,
    metaAdAccountId: "act_223344556",
    status: "Active",
    kpiTargets: {
      roas: 3.5,
      cpl: 30000,
      ctr: 2.0,
      leadsPerMonth: 150,
      impressions: 300000,
      frequency: 2.5
    }
  },
  {
    id: 3,
    name: "ModaStyle Fashion",
    industry: "Fashion",
    pic: "Dewi Kusuma",
    budgetPerMonth: 12000000,
    metaAdAccountId: "act_334455667",
    status: "Active",
    kpiTargets: {
      roas: 5.0,
      cpl: 20000,
      ctr: 3.0,
      leadsPerMonth: 300,
      impressions: 600000,
      frequency: 2.0
    }
  },
  {
    id: 4,
    name: "SehatSelalu Clinic",
    industry: "Healthcare",
    pic: "Dr. Ahmad",
    budgetPerMonth: 6000000,
    metaAdAccountId: "act_445566778",
    status: "Active",
    kpiTargets: {
      roas: 3.0,
      cpl: 40000,
      ctr: 1.5,
      leadsPerMonth: 80,
      impressions: 200000,
      frequency: 3.5
    }
  },
  {
    id: 5,
    name: "PropNusantara",
    industry: "Properti",
    pic: "Hendra W.",
    budgetPerMonth: 20000000,
    metaAdAccountId: "act_556677889",
    status: "Active",
    kpiTargets: {
      roas: 6.0,
      cpl: 50000,
      ctr: 2.0,
      leadsPerMonth: 50,
      impressions: 400000,
      frequency: 2.8
    }
  }
];

module.exports = clients;
