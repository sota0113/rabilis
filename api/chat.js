const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR1fXJhy-p9Qj86J-toFWKgIVcVSp0_fzCmWoNirX7nXqx1RnFS3KorGy9yfRn2-Lwd21TGr2fpxGIX/pub?gid=0&single=true&output=csv';
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (vals[i] || '').trim().replace(/^"|"$/g, '');
    });
    return obj;
  }).filter(row => row.date);
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('/').map(Number);
  const date = new Date(y, m - 1, d);
  const wday = WEEKDAYS_JA[date.getDay()];
  return `${y}年${m}月${d}日（${wday}）`;
}

function isPast(dateStr) {
  const [y, m, d] = dateStr.split('/').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

async function fetchSchedule() {
  try {
    const res = await fetch(CSV_URL);
    const text = await res.text();
    const rows = parseCSV(text);
    const upcoming = rows.filter(row => !isPast(row.date));
    if (!upcoming.length) return '現在予定されている練習はありません。';
    return upcoming.map(row =>
      `- ${formatDate(row.date)} ${row.time} ／ ${row.place} ［${row.status}］`
    ).join('\n');
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { message, history, lang } = body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const schedule = await fetchSchedule();

  let systemPrompt;
  if (lang === 'en') {
    const scheduleSection = schedule
      ? `[Upcoming Practice Sessions]\n${schedule}`
      : '[Upcoming Practice Sessions]\nCould not load schedule. Please check the Schedule section on the website.';
    systemPrompt = `You are the official assistant for RABILIS, a badminton club in Tokyo.
Answer visitors' questions in English, in a friendly and concise way.
Keep your replies to 3 sentences or fewer.

[Club Info]
- Name: RABILIS
- Founded: 2023
- Location: Koto area, Tokyo
- Session fee: ¥800–900 (shuttlecocks included)
- Gender ratio: 50/50 male/female
- Age range: 20s–50s
- Atmosphere: No hierarchy, first names only, welcoming
- Features: Entry-level coaching by advanced players, inter-high school experienced members, monthly tournaments
- Trial sessions: Drop-ins and observers welcome, rackets available to borrow
- Apply via: Listing board (net-menber.com) or Instagram
- Instagram: @rabilis_badminton_tokyo

${scheduleSection}

For questions you cannot answer, direct visitors to Instagram.`;
  } else {
    const scheduleSection = schedule
      ? `【直近の練習スケジュール】\n${schedule}`
      : '【直近の練習スケジュール】\nスケジュールの取得に失敗しました。サイトのスケジュールセクションをご確認ください。';
    systemPrompt = `あなたはRABILIS（ラビリス）バドミントンクラブの公式アシスタントです。
以下の情報をもとに、訪問者の質問に日本語で丁寧かつ親しみやすく答えてください。
回答は必ず3文以内の短い文章にしてください。

【クラブ情報】
- クラブ名：RABILIS（ラビリス）
- 設立：2023年
- 場所：東京・江東区周辺
- 参加費：800〜900円（シャトル代込）
- 男女比：男女半々（50/50）
- 年代：20〜50代
- 雰囲気：上下関係なし、あだ名呼び合い、アットホーム
- 特徴：初級者サポート体制あり、インターハイ出場経験者も在籍、月1程度の大会参加
- 体験参加：見学のみもOK、ラケット貸し出し可能
- 申し込み：掲示板（net-menber.com）またはInstagramから
- Instagram：@rabilis_badminton_tokyo

${scheduleSection}

答えられない質問はInstagramへ誘導してください。`;
  }

  const contents = [
    ...(history || []),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', err);
      return res.status(500).json({ error: 'Gemini API error' });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'うまく回答できませんでした。';

    return res.status(200).json({
      reply,
      history: [
        ...(history || []),
        { role: 'user', parts: [{ text: message }] },
        { role: 'model', parts: [{ text: reply }] }
      ]
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
