export type CustomEmojiCharacter = 'cat' | 'dog' | 'panda' | 'bunny' | 'bear' | 'fox';
export type CustomEmojiEmotion = 'laugh' | 'cry' | 'love' | 'angry' | 'surprised';

export interface ICustomEmoji {
  id: string;
  packId: string;
  character: CustomEmojiCharacter;
  emotion: CustomEmojiEmotion;
  name: string;
  description: string;
  keywords: string[];
  duration: number; // in milliseconds (e.g. 2000)
  version: number;
}

export interface IEmojiPack {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: number;
  emojis: ICustomEmoji[];
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
