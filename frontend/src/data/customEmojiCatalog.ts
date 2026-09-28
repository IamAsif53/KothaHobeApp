import { ICustomEmoji, IEmojiPack, CustomEmojiCharacter, CustomEmojiEmotion } from '../types/customEmoji';

export const CUTE_FRIENDS_PACK: IEmojiPack = {
  id: 'cute_friends',
  name: 'Cute Friends',
  description: 'Expressive and adorable animated animal reactions',
  icon: '🐱',
  version: 1,
  emojis: [
    // 1. CAT (5 Emotions)
    {
      id: 'cat_laugh',
      packId: 'cute_friends',
      character: 'cat',
      emotion: 'laugh',
      name: 'Cat Laughing',
      description: 'Cute orange cat giggling happily with teary eyes',
      keywords: ['cat', 'laugh', 'lol', 'haha', 'giggle', 'joy', 'happy', 'kitten'],
      duration: 2200,
      version: 1,
    },
    {
      id: 'cat_cry',
      packId: 'cute_friends',
      character: 'cat',
      emotion: 'cry',
      name: 'Cat Crying',
      description: 'Sad little cat weeping with gentle tear streams',
      keywords: ['cat', 'cry', 'sad', 'tears', 'sob', 'pain', 'heartbroken'],
      duration: 2400,
      version: 1,
    },
    {
      id: 'cat_love',
      packId: 'cute_friends',
      character: 'cat',
      emotion: 'love',
      name: 'Cat Loving',
      description: 'Sweet cat with blushing cheeks and pulsing floating hearts',
      keywords: ['cat', 'love', 'heart', 'adore', 'kiss', 'crush', 'cute', 'sweet'],
      duration: 2000,
      version: 1,
    },
    {
      id: 'cat_angry',
      packId: 'cute_friends',
      character: 'cat',
      emotion: 'angry',
      name: 'Cat Angry',
      description: 'Pouting grumpy cat with steaming ears and furrowed brows',
      keywords: ['cat', 'angry', 'mad', 'grumpy', 'rage', 'furious', 'pout'],
      duration: 1800,
      version: 1,
    },
    {
      id: 'cat_surprised',
      packId: 'cute_friends',
      character: 'cat',
      emotion: 'surprised',
      name: 'Cat Surprised',
      description: 'Astonished cat with wide eyes and popping exclamation reaction',
      keywords: ['cat', 'surprised', 'wow', 'omg', 'shocked', 'gasp', 'amazed'],
      duration: 1900,
      version: 1,
    },

    // 2. DOG (5 Emotions)
    {
      id: 'dog_laugh',
      packId: 'cute_friends',
      character: 'dog',
      emotion: 'laugh',
      name: 'Dog Laughing',
      description: 'Golden puppy panting and chuckling with joyful waggly ears',
      keywords: ['dog', 'puppy', 'laugh', 'joy', 'happy', 'haha', 'bark'],
      duration: 2100,
      version: 1,
    },
    {
      id: 'dog_cry',
      packId: 'cute_friends',
      character: 'dog',
      emotion: 'cry',
      name: 'Dog Crying',
      description: 'Sad puppy with droopy ears and big glossy weeping eyes',
      keywords: ['dog', 'puppy', 'cry', 'sad', 'whine', 'tears', 'hurt'],
      duration: 2400,
      version: 1,
    },
    {
      id: 'dog_love',
      packId: 'cute_friends',
      character: 'dog',
      emotion: 'love',
      name: 'Dog Loving',
      description: 'Puppy with heart-filled eyes and happy tail wagging energy',
      keywords: ['dog', 'love', 'heart', 'loyal', 'adore', 'affection', 'cuddle'],
      duration: 2000,
      version: 1,
    },
    {
      id: 'dog_angry',
      packId: 'cute_friends',
      character: 'dog',
      emotion: 'angry',
      name: 'Dog Angry',
      description: 'Playful feisty growling puppy with fiery mood puffs',
      keywords: ['dog', 'angry', 'mad', 'growl', 'grr', 'bark', 'fierce'],
      duration: 1900,
      version: 1,
    },
    {
      id: 'dog_surprised',
      packId: 'cute_friends',
      character: 'dog',
      emotion: 'surprised',
      name: 'Dog Surprised',
      description: 'Puppy with perked ears and curious tilted head surprise',
      keywords: ['dog', 'surprised', 'what', 'curious', 'wow', 'pup', 'shock'],
      duration: 1800,
      version: 1,
    },

    // 3. PANDA (5 Emotions)
    {
      id: 'panda_laugh',
      packId: 'cute_friends',
      character: 'panda',
      emotion: 'laugh',
      name: 'Panda Laughing',
      description: 'Chubby panda rolling with hearty belly laughter',
      keywords: ['panda', 'laugh', 'chuckle', 'cute', 'funny', 'haha', 'giggle'],
      duration: 2200,
      version: 1,
    },
    {
      id: 'panda_cry',
      packId: 'cute_friends',
      character: 'panda',
      emotion: 'cry',
      name: 'Panda Crying',
      description: 'Cuddly panda wiping big teardrops from fuzzy cheeks',
      keywords: ['panda', 'cry', 'sad', 'bawl', 'tears', 'weep', 'comfort'],
      duration: 2300,
      version: 1,
    },
    {
      id: 'panda_love',
      packId: 'cute_friends',
      character: 'panda',
      emotion: 'love',
      name: 'Panda Loving',
      description: 'Panda hugging a glowing pink heart with rosy cheeks',
      keywords: ['panda', 'love', 'heart', 'hug', 'warm', 'sweet', 'tender'],
      duration: 2000,
      version: 1,
    },
    {
      id: 'panda_angry',
      packId: 'cute_friends',
      character: 'panda',
      emotion: 'angry',
      name: 'Panda Angry',
      description: 'Stubborn panda crossing paws with fiery angry puffs',
      keywords: ['panda', 'angry', 'mad', 'stubborn', 'pout', 'no'],
      duration: 1900,
      version: 1,
    },
    {
      id: 'panda_surprised',
      packId: 'cute_friends',
      character: 'panda',
      emotion: 'surprised',
      name: 'Panda Surprised',
      description: 'Panda dropping its jaw with wide round black eye patches',
      keywords: ['panda', 'surprised', 'whoa', 'gasp', 'shocked', 'omg'],
      duration: 1800,
      version: 1,
    },

    // 4. BUNNY (5 Emotions)
    {
      id: 'bunny_laugh',
      packId: 'cute_friends',
      character: 'bunny',
      emotion: 'laugh',
      name: 'Bunny Laughing',
      description: 'Fluffy white bunny hopping with joyful laughter and wiggly nose',
      keywords: ['bunny', 'rabbit', 'laugh', 'hop', 'giggle', 'cute', 'joy'],
      duration: 2000,
      version: 1,
    },
    {
      id: 'bunny_cry',
      packId: 'cute_friends',
      character: 'bunny',
      emotion: 'cry',
      name: 'Bunny Crying',
      description: 'Fragile bunny with droopy long ears and splashing teardrops',
      keywords: ['bunny', 'rabbit', 'cry', 'sad', 'sob', 'sniffle', 'tears'],
      duration: 2400,
      version: 1,
    },
    {
      id: 'bunny_love',
      packId: 'cute_friends',
      character: 'bunny',
      emotion: 'love',
      name: 'Bunny Loving',
      description: 'Bunny blowing floating kiss hearts with sparkling eyes',
      keywords: ['bunny', 'rabbit', 'love', 'kiss', 'heart', 'sparkle', 'sweet'],
      duration: 2100,
      version: 1,
    },
    {
      id: 'bunny_angry',
      packId: 'cute_friends',
      character: 'bunny',
      emotion: 'angry',
      name: 'Bunny Angry',
      description: 'Puffed up bunny thumping foot with grumpy red cheeks',
      keywords: ['bunny', 'rabbit', 'angry', 'thump', 'mad', 'fume'],
      duration: 1800,
      version: 1,
    },
    {
      id: 'bunny_surprised',
      packId: 'cute_friends',
      character: 'bunny',
      emotion: 'surprised',
      name: 'Bunny Surprised',
      description: 'Bunny with ears shooting straight up in disbelief',
      keywords: ['bunny', 'rabbit', 'surprised', 'alert', 'pop', 'gasp'],
      duration: 1700,
      version: 1,
    },

    // 5. BEAR (5 Emotions)
    {
      id: 'bear_laugh',
      packId: 'cute_friends',
      character: 'bear',
      emotion: 'laugh',
      name: 'Bear Laughing',
      description: 'Big gentle brown bear chuckling warmly with happy closed eyes',
      keywords: ['bear', 'laugh', 'giggle', 'haha', 'warm', 'gentle', 'lol'],
      duration: 2100,
      version: 1,
    },
    {
      id: 'bear_cry',
      packId: 'cute_friends',
      character: 'bear',
      emotion: 'cry',
      name: 'Bear Crying',
      description: 'Big bear sniffling into its paws with giant teardrops',
      keywords: ['bear', 'cry', 'sad', 'sob', 'heartbroken', 'grief'],
      duration: 2300,
      version: 1,
    },
    {
      id: 'bear_love',
      packId: 'cute_friends',
      character: 'bear',
      emotion: 'love',
      name: 'Bear Loving',
      description: 'Warm bear sending big glowing bear hugs and hearts',
      keywords: ['bear', 'love', 'hug', 'care', 'adore', 'heart', 'cozy'],
      duration: 2000,
      version: 1,
    },
    {
      id: 'bear_angry',
      packId: 'cute_friends',
      character: 'bear',
      emotion: 'angry',
      name: 'Bear Angry',
      description: 'Grumbling bear with steam blowing out of round ears',
      keywords: ['bear', 'angry', 'grumpy', 'roar', 'mad', 'steam'],
      duration: 1900,
      version: 1,
    },
    {
      id: 'bear_surprised',
      packId: 'cute_friends',
      character: 'bear',
      emotion: 'surprised',
      name: 'Bear Surprised',
      description: 'Bear blinking in shock with floating question sparks',
      keywords: ['bear', 'surprised', 'shock', 'wow', 'huh', 'curious'],
      duration: 1800,
      version: 1,
    },

    // 6. FOX (5 Emotions)
    {
      id: 'fox_laugh',
      packId: 'cute_friends',
      character: 'fox',
      emotion: 'laugh',
      name: 'Fox Laughing',
      description: 'Clever orange fox grinning mischievously with sparkling eyes',
      keywords: ['fox', 'laugh', 'giggle', 'grin', 'mischief', 'cute', 'haha'],
      duration: 2100,
      version: 1,
    },
    {
      id: 'fox_cry',
      packId: 'cute_friends',
      character: 'fox',
      emotion: 'cry',
      name: 'Fox Crying',
      description: 'Sleek fox with tucked ears and crying shiny blue tears',
      keywords: ['fox', 'cry', 'sad', 'whimper', 'tears', 'sorrow'],
      duration: 2300,
      version: 1,
    },
    {
      id: 'fox_love',
      packId: 'cute_friends',
      character: 'fox',
      emotion: 'love',
      name: 'Fox Loving',
      description: 'Charming fox forming a heart shape with its fluffy tail',
      keywords: ['fox', 'love', 'heart', 'tail', 'charm', 'crush', 'kiss'],
      duration: 2000,
      version: 1,
    },
    {
      id: 'fox_angry',
      packId: 'cute_friends',
      character: 'fox',
      emotion: 'angry',
      name: 'Fox Angry',
      description: 'Fiery fox bristling with flaming cheeks and narrowed eyes',
      keywords: ['fox', 'angry', 'mad', 'snarl', 'flame', 'fierce'],
      duration: 1900,
      version: 1,
    },
    {
      id: 'fox_surprised',
      packId: 'cute_friends',
      character: 'fox',
      emotion: 'surprised',
      name: 'Fox Surprised',
      description: 'Fox with big triangular ears twitching in astonishment',
      keywords: ['fox', 'surprised', 'gasp', 'shock', 'whoa', 'wow'],
      duration: 1800,
      version: 1,
    },
  ],
};

export const ALL_EMOJI_PACKS: IEmojiPack[] = [CUTE_FRIENDS_PACK];

export const ALL_CUSTOM_EMOJIS: ICustomEmoji[] = CUTE_FRIENDS_PACK.emojis;

const EMOJI_MAP: Record<string, ICustomEmoji> = ALL_CUSTOM_EMOJIS.reduce((acc, emoji) => {
  acc[emoji.id] = emoji;
  return acc;
}, {} as Record<string, ICustomEmoji>);

export const getCustomEmojiById = (id: string): ICustomEmoji | null => {
  if (!id) return null;
  const cleanId = id.replace(/^:|:$/g, '').trim().toLowerCase();
  return EMOJI_MAP[cleanId] || null;
};

export const isCustomEmojiId = (id: string): boolean => {
  if (!id) return false;
  const cleanId = id.replace(/^:|:$/g, '').trim().toLowerCase();
  return !!EMOJI_MAP[cleanId];
};

export const getCustomEmojisByCharacter = (character: CustomEmojiCharacter): ICustomEmoji[] => {
  return ALL_CUSTOM_EMOJIS.filter((e) => e.character === character);
};

export const getCustomEmojisByEmotion = (emotion: CustomEmojiEmotion): ICustomEmoji[] => {
  return ALL_CUSTOM_EMOJIS.filter((e) => e.emotion === emotion);
};

export const searchCustomEmojis = (query: string): ICustomEmoji[] => {
  if (!query || !query.trim()) return ALL_CUSTOM_EMOJIS;
  const q = query.toLowerCase().trim();
  return ALL_CUSTOM_EMOJIS.filter(
    (e) =>
      e.id.includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.character.toLowerCase().includes(q) ||
      e.emotion.toLowerCase().includes(q) ||
      e.keywords.some((k) => k.toLowerCase().includes(q))
  );
};

export const CHARACTER_TABS: { id: 'all' | CustomEmojiCharacter; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '✨' },
  { id: 'cat', label: 'Cat', icon: '🐱' },
  { id: 'dog', label: 'Dog', icon: '🐶' },
  { id: 'panda', label: 'Panda', icon: '🐼' },
  { id: 'bunny', label: 'Bunny', icon: '🐰' },
  { id: 'bear', label: 'Bear', icon: '🐻' },
  { id: 'fox', label: 'Fox', icon: '🦊' },
];
