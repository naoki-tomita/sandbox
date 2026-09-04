# 解析用キャッシュの受け渡し場所

収集がうまくいかないとき、**実際の検索結果 HTML があれば原因はほぼ確実に
特定できる。** 駿河屋の「全件240円」も、ここに HTML を置いてもらって
初めて送料案内を拾っていると分かった。

`.cache/` 自体は追跡していない（1回の収集で数十MBになる）。渡したいぶんだけ
ここにコピーしてコミットする。

## 渡し方

```bash
# 数号だけ収集してキャッシュを作る
uv run --with playwright src/collect.py \
    --mode issue --sources mercari_sold --engine playwright \
    --scroll 10 --limit 3 --keep-unmatched \
    --cache-dir handoff-cache/mercari

git add handoff-cache && git commit -m "メルカリのキャッシュ" && git push
```

`--cache-dir` を直接ここに向ければコピーの手間もない。

## 注意

- **まず少数号で試すこと。** 168号ぶん全部だと重いうえ、パーサが合って
  いなければどのみち取り直しになる
- 収集の最後に出る `[警告] ... 全件が N 円` は必ず読むこと。値が入って
  いる以上パースは成功して見えるが、ページ共通の要素を拾っている

## 済んだら

パーサが直って本番収集が終わったら、ここのファイルは消してよい。
