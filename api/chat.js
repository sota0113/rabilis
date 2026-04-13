module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { message, history } = body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const systemPrompt = `あなたはRABILIS（ラビリス）バドミントンクラブの公式アシスタントです。
以下の情報をもとに、訪問者の質問に日本語で丁寧かつ親しみやすく答えてください。

【クラブ情報】
- クラブ名：RABILIS（ラビリス）
- 設立：2023年
- 場所：東京・江東区周辺
- 参加費：800〜900円（シャトル代込）
- 男女比：男女半々（50/50）
- 年代：20〜50代
- 雰囲気：上下関係なし、あだ名呼び合い、アットホーム
- 特徴：初心者サポート体制あり、インターハイ出場経験者も在籍、月1程度の大会参加
- 体験参加：見学のみもOK、ラケット貸し出し可能
- 申し込み：掲示板（net-menber.com）またはInstagramから
- Instagram：@rabilis_badminton_tokyo

スケジュールの詳細や最新情報はサイトのスケジュールセクションを確認するよう案内してください。
答えられない質問はInstagramへ誘導してください。`;

  const contents = [
    ...(history || []),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
      return res.status(500).json({ error: 'Gemini API error', detail: err });
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
    return res.status(500).json({ error: 'Internal server error', detail: e.message });
  }
}
