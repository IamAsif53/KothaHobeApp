import { IMessage } from '../types';

/**
 * Formats canonical conversation preview text for chat lists, search results, and push/socket sync
 */
export function formatConversationPreview(
  lastMessage?: Partial<IMessage> | null,
  isGroup?: boolean
): string {
  if (!lastMessage) {
    return isGroup ? 'Group created' : 'Started conversation';
  }

  const rawText = (lastMessage.text || '').trim();
  const type = lastMessage.type || 'text';
  const attachment = lastMessage.attachment;

  // Handle deleted messages
  if (lastMessage.isDeletedForEveryone) {
    return 'This message was deleted';
  }

  switch (type) {
    case 'image': {
      if (rawText && rawText !== 'Photo' && rawText !== '📷 Photo') {
        return `📷 ${rawText}`;
      }
      return '📷 Photo';
    }

    case 'audio': {
      return '🎙 Voice message';
    }

    case 'document': {
      const fileName = attachment?.fileName || 'Document';
      if (rawText && rawText !== fileName && rawText !== `📄 ${fileName}`) {
        return `📄 ${fileName}: ${rawText}`;
      }
      return `📄 ${fileName}`;
    }

    case 'custom_emoji': {
      return '✨ Animated Emoji';
    }

    case 'call': {
      if (rawText.toLowerCase().includes('missed')) {
        return '📞 Missed voice call';
      }
      return '📞 Voice call';
    }

    case 'system': {
      return rawText || 'System update';
    }

    case 'text':
    default: {
      if (rawText) {
        return rawText;
      }
      // If type is text but there is an attachment
      if (attachment?.fileName) {
        return `📄 ${attachment.fileName}`;
      }
      if (attachment?.url) {
        return '📎 Attachment';
      }
      return isGroup ? 'Group created' : 'Started conversation';
    }
  }
}

/**
 * Format preview for group chats with sender nickname prefix
 */
export function formatGroupConversationPreview(
  senderNickname?: string,
  lastMessage?: Partial<IMessage> | null
): string {
  const basePreview = formatConversationPreview(lastMessage, true);
  if (!senderNickname || basePreview === 'Group created' || basePreview === 'This message was deleted') {
    return basePreview;
  }
  return `${senderNickname}: ${basePreview}`;
}
