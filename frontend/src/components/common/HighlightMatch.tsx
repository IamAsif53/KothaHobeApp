import React from 'react';

interface HighlightMatchProps {
  text: string;
  query: string;
  className?: string;
  highlightClassName?: string;
}

export const HighlightMatch: React.FC<HighlightMatchProps> = ({
  text,
  query,
  className = '',
  highlightClassName = 'bg-brand-500/25 text-brand-600 dark:text-brand-300 font-bold px-0.5 rounded',
}) => {
  if (!query || !query.trim() || !text) {
    return <span className={className}>{text}</span>;
  }

  const cleanQuery = query.trim().startsWith('@') ? query.trim().slice(1) : query.trim();
  if (!cleanQuery) {
    return <span className={className}>{text}</span>;
  }

  // Escape special regex characters
  const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (regex.test(part)) {
          return (
            <mark key={index} className={highlightClassName}>
              {part}
            </mark>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
};
