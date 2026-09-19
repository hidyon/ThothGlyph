# issueごとの所要トークン

issueを1件片付けるのにどれだけのトークンを使ったかの記録。見積りの材料にする。

## 数え方

Claude Codeのセッションログ（`~/.claude/projects/<プロジェクト>/<セッションID>.jsonl`）の
各アシスタントメッセージの `usage` を合計する。

```bash
python3 - <<'PY'
import json, sys
tot = {}
for line in open(sys.argv[1] if len(sys.argv) > 1 else 0):
    try: d = json.loads(line)
    except ValueError: continue
    u = (d.get('message') or {}).get('usage')
    if not u: continue
    for k, v in u.items():
        if isinstance(v, int): tot[k] = tot.get(k, 0) + v
print(tot, '合計', sum(tot.values()))
PY
```

注意:
- `cache_read` が大半を占める。同じ文脈を読み直すたびに積み上がるので、
  「会話の長さ×やり取りの回数」に効く数字であって、成果物の量とは比例しない。
- セッションを跨いでissueを進めた場合は、該当する全セッションのログを足す。
- 下の数値はissueをクローズした時点のもの。コミットやこの表の更新自体は含まない。

## 記録

| # | タイトル | 合計 | 出力 | キャッシュ作成 | キャッシュ読み | 入力 |
|---|---|---|---|---|---|---|
| 0001 | 編集内容の自動保存 | 約241万 | 36,974 | 83,756 | 2,292,867 | 88 |

0001の内訳の所感: 仕様を書く→実装→実機検証の3往復で、検証スクリプトの失敗と
修正が2回。1回のやり取りごとに会話全体を読み直すため、キャッシュ読みが95%を占める。
