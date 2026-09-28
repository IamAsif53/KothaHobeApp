export const APPROVED_CUSTOM_EMOJI_IDS = new Set<string>([
  // Cat (5)
  'cat_laugh',
  'cat_cry',
  'cat_love',
  'cat_angry',
  'cat_surprised',

  // Dog (5)
  'dog_laugh',
  'dog_cry',
  'dog_love',
  'dog_angry',
  'dog_surprised',

  // Panda (5)
  'panda_laugh',
  'panda_cry',
  'panda_love',
  'panda_angry',
  'panda_surprised',

  // Bunny (5)
  'bunny_laugh',
  'bunny_cry',
  'bunny_love',
  'bunny_angry',
  'bunny_surprised',

  // Bear (5)
  'bear_laugh',
  'bear_cry',
  'bear_love',
  'bear_angry',
  'bear_surprised',

  // Fox (5)
  'fox_laugh',
  'fox_cry',
  'fox_love',
  'fox_angry',
  'fox_surprised',
]);

export const isValidCustomEmojiId = (id?: string | null): boolean => {
  if (!id || typeof id !== 'string') return false;
  const cleanId = id.replace(/^:|:$/g, '').trim().toLowerCase();
  return APPROVED_CUSTOM_EMOJI_IDS.has(cleanId);
};
