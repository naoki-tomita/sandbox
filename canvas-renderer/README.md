# canvas-renderer

ReactコンポーネントをDOMではなく **2D Canvas** に描画する、小さなカスタムレンダラです。
[`react-reconciler`](https://www.npmjs.com/package/react-reconciler) を使い、
`react-three-fiber` や `react-pixi` と同じ仕組みで独自のホスト環境を実装しています。

`react-dom` の代わりに使えるイメージで、フック・state・再レンダリングはすべて
通常どおり動作し、その結果が `<canvas>` に描画されます。

## 使い方

```tsx
import { render, View, Text, Circle } from 'canvas-renderer';

function Counter() {
  const [n, setN] = useState(0);
  return (
    <View style={{ padding: 16, gap: 8, alignItems: 'center' }}>
      <Text style={{ fontSize: 32, color: '#fff' }}>{String(n)}</Text>
      <View
        style={{ padding: 8, backgroundColor: '#69f', borderRadius: 6 }}
        onClick={() => setN((c) => c + 1)}
      >
        <Text style={{ color: '#fff' }}>+1</Text>
      </View>
    </View>
  );
}

const canvas = document.querySelector('canvas')!;
const root = render(<Counter />, canvas, { background: '#0d0d1a' });
// root.render(<Counter />)  // 別のツリーに差し替え
// root.unmount()            // 後始末
```

## ホストコンポーネント

| コンポーネント | 役割 |
| --- | --- |
| `<View>`   | フレックスコンテナ（背景・枠線・角丸・レイアウト） |
| `<Text>`   | テキスト（フォント・色・揃え） |
| `<Image>`  | `src` から読み込んでキャッシュする画像 |
| `<Circle>` | `style.radius` で描く塗り/枠線つきの円 |

## スタイルとレイアウト

`style` は CSS の flexbox サブセットです。

- レイアウト: `flexDirection` (`row` / `column`)、`gap`、`padding*`、
  `alignItems` (`flex-start` / `center` / `flex-end` / `stretch`)、
  `justifyContent` (`flex-start` / `center` / `flex-end` / `space-between` / `space-around`)
- 絶対配置: `position: 'absolute'` + `left` / `top`（親のパディングボックス基準）
- サイズ: `width` / `height`（未指定なら子から自動算出）
- 見た目: `backgroundColor`、`borderColor`、`borderWidth`、`borderRadius`、`opacity`
- テキスト: `color`、`fontSize`、`fontFamily`、`fontWeight`、`fontStyle`、
  `lineHeight`、`textAlign`

## イベント

ヒットテストで最前面のノードを判定し、子から親へバブリングします。
`onClick` / `onPointerDown` / `onPointerUp` / `onPointerMove` /
`onPointerEnter` / `onPointerLeave` が使え、ハンドラの引数では
`event.stopPropagation()` でバブリングを止められます。

## 設計

```
React要素
  └─ reconciler.ts   react-reconciler の HostConfig → CanvasNode ツリーを構築
       └─ render.tsx 描画スケジューリング・DPR対応・イベント配線・画像キャッシュ
            ├─ layout.ts  純粋なフレックスレイアウト（Canvas非依存・テスト可能）
            ├─ paint.ts   レイアウト済みツリーを 2D context に描画
            └─ events.ts  ヒットテストとイベントのバブリング
```

`layout.ts` と `events.ts` は Canvas に依存しない純粋関数なので、
`src/layout.test.ts` で単体テストしています。

## 開発

```bash
npm install
npm run dev        # デモ（http://localhost:5173）
npm test           # レイアウト/イベントのテスト
npm run typecheck  # 型チェック
npm run build      # 本番ビルド
```
