export type CustomEmojiPackId =
  | 'cute_friends'
  | 'love'
  | 'funny'
  | 'mood'
  | 'celebration'
  | 'food'
  | 'animals';

export type CustomEmojiCharacter =
  | 'cat'
  | 'dog'
  | 'panda'
  | 'bunny'
  | 'bear'
  | 'fox'
  | 'heart'
  | 'kiss'
  | 'hug'
  | 'couple'
  | 'rose'
  | 'letter'
  | 'lol'
  | 'rofl'
  | 'facepalm'
  | 'dead'
  | 'wink'
  | 'troll'
  | 'awkward'
  | 'oops'
  | 'popcorn'
  | 'mindblown'
  | 'happy'
  | 'sad'
  | 'angry'
  | 'sleepy'
  | 'confused'
  | 'shocked'
  | 'excited'
  | 'bored'
  | 'nervous'
  | 'cool'
  | 'party'
  | 'congrats'
  | 'clap'
  | 'fire'
  | 'dance'
  | 'trophy'
  | 'champagne'
  | 'pizza'
  | 'burger'
  | 'coffee'
  | 'tea'
  | 'cake'
  | 'icecream'
  | 'donut'
  | 'ramen'
  | 'boba'
  | 'penguin'
  | 'koala'
  | 'hamster'
  | 'frog'
  | 'duck'
  | 'lion'
  | 'tiger'
  | 'elephant'
  | 'monkey'
  | 'owl'
  | string;

export type CustomEmojiEmotion =
  | 'laugh'
  | 'cry'
  | 'love'
  | 'angry'
  | 'surprised'
  | 'kiss'
  | 'hug'
  | 'blush'
  | 'sparkle'
  | 'broken'
  | 'wink'
  | 'facepalm'
  | 'dead'
  | 'troll'
  | 'awkward'
  | 'mindblown'
  | 'sleepy'
  | 'confused'
  | 'excited'
  | 'bored'
  | 'cool'
  | 'party'
  | 'celebrate'
  | 'dance'
  | 'clap'
  | 'fire'
  | 'yummy'
  | 'hungry'
  | 'chef'
  | 'sip'
  | 'quack'
  | 'roar'
  | 'sleep'
  | string;

export interface ICustomEmoji {
  id: string;
  packId: CustomEmojiPackId | string;
  character: CustomEmojiCharacter;
  emotion: CustomEmojiEmotion;
  name: string;
  description: string;
  keywords: string[];
  duration: number; // in milliseconds (e.g. 2000)
  version: number;
}

export interface IEmojiPack {
  id: CustomEmojiPackId | string;
  name: string;
  description: string;
  icon: string;
  version: number;
  emojis: ICustomEmoji[];
}

export interface ICustomEmojiCategory {
  id: string;
  name: string;
  icon: string;
  packId?: CustomEmojiPackId | string;
  isSpecial?: boolean;
}

export interface CustomEmojiRenderProps {
  emojiId: string;
  size?: number | 'sm' | 'md' | 'lg' | 'xl';
  autoPlay?: boolean;
  loop?: boolean;
  interactive?: boolean;
  className?: string;
  onComplete?: () => void;
  onClick?: () => void;
}
