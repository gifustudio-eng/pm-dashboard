// ============================================================
// lib/metaSocial.js
// Placeholder untuk Facebook Page & Instagram insights.
// File ini sebelumnya belum ada di repo — di sync/all.js dipanggil
// secara optional (try/catch) untuk ambil data social media (followers,
// reach, engagement) di luar data Ads.
//
// Saat ini fungsi ini hanya return data kosong supaya sync Ads (ROAS,
// CPL, leads, dst) tetap berjalan normal tanpa error.
//
// TODO: implementasikan fetch ke:
//   - /{facebook_page_id}/insights
//   - /{instagram_user_id}/insights
// kalau ingin menampilkan metrik social media (followers, reach, dll)
// di dashboard.
// ============================================================

async function fetchAllInsights(client, days = 30) {
  return {
    social: {
      current: { followers: 0, reach: 0, views: 0, extLinkTaps: 0, engRate: 0 },
      previous: {}
    },
    comparison: {}
  };
}

module.exports = { fetchAllInsights };
