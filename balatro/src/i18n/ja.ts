import type { Suit } from '../game/cards';
import type { DeepPartial, Translations } from './types';

const suitNames: Record<Suit, string> = {
  spades: 'スペード',
  hearts: 'ハート',
  diamonds: 'ダイヤ',
  clubs: 'クラブ',
};

/**
 * Japanese overrides. Any key omitted here falls back to English at merge
 * time (see buildTranslations), so this table may be partial.
 */
export const ja: DeepPartial<Translations> = {
  blindSettled: n => `ブラインド ${n} 清算`,
  blindCleared: 'ブラインド突破',
  nextBlind: '次のブラインド →',
  playAgain: 'もう一度プレイ',
  gameOver: 'ゲームオーバー',
  reachedBlind: n => `到達ブラインド ${n}`,
  selectHint: remaining => `カードを5枚まで選択 · 残り${remaining}枚`,

  blindNo: n => `第${n}ブラインド`,
  ofTarget: target => `/ ${target}`,
  handsLeft: 'ハンド',
  discards: 'ディスカード',
  scoredPlus: total => `+${total} 獲得`,

  playHand: 'ハンドをプレイ',
  discard: 'ディスカード',

  workshopOffers: '工房の品ぞろえ',
  takeAJoker: 'ジョーカーを1枚',
  continueWithout: '選ばずに進む',

  scoredStamp: '採点',
  baseTag: '基本',
  chips: 'チップ',
  mult: '倍率',
  score: 'スコア',
  multUnit: '倍率',

  handNames: {
    royal_flush: 'ロイヤルフラッシュ',
    straight_flush: 'ストレートフラッシュ',
    four_of_a_kind: 'フォーカード',
    full_house: 'フルハウス',
    flush: 'フラッシュ',
    straight: 'ストレート',
    three_of_a_kind: 'スリーカード',
    two_pair: 'ツーペア',
    pair: 'ペア',
    high_card: 'ハイカード',
  },

  jokers: {
    apprentice: { name: '見習い', description: '+4 倍率、いつでも前のめり' },
    lacquer_pot: { name: '漆の壺', description: '♥ 1枚につき +3 倍率' },
    vermilion_jar: { name: '朱の壺', description: '♦ 1枚につき +3 倍率' },
    india_ink: { name: '墨汁', description: '♠ 1枚につき +3 倍率' },
    lamp_black: { name: '油煙墨', description: '♣ 1枚につき +3 倍率' },
    twin_press: { name: '双子刷り', description: '役にペアが含まれるとき +50 チップ' },
    short_run: { name: '少部数', description: '3枚以下でプレイすると +20 倍率' },
    uncut_sheets: { name: '未裁断シート', description: '残りディスカード1回につき +30 チップ' },
    last_scrap: { name: '最後の端材', description: 'ディスカードが残っていないとき +15 倍率' },
    even_grain: { name: '偶数の目', description: '偶数のカード（2,4,6,8,10,Q）1枚につき +4 倍率' },
    odd_lot: { name: '奇数の山', description: '奇数のカード（A,3,5,7,9,J,K）1枚につき +30 チップ' },
    court_painter: { name: '宮廷画家', description: '場の絵札1枚につき +30 チップ' },
    collector: { name: '蒐集家', description: '所持ジョーカー1枚につき +3 倍率' },
    engraver: { name: '彫師', description: '役に絵札が含まれるとき ×2 倍率' },
    guilloche: { name: 'ギヨシェ彫り', description: 'フラッシュのとき ×3 倍率' },
  },

  suitNames,
  cardLabel: (rank, suit) => `${suitNames[suit]}の${rank}`,
};
