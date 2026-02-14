import React from 'react';
import { Type } from 'lucide-react';
import { TimelineItemLabel } from './timeline-item-label';
import { BaseItemContentProps } from '../timeline-item-content-factory';

interface TextItemContentProps extends BaseItemContentProps {
  data?: {
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    color?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    verticalAlign?: 'top' | 'center' | 'bottom';
  };
}

export const TextItemContent: React.FC<TextItemContentProps> = ({
  label,
  data,
  isHovering = false,
}) => {
  const textToDisplay = data?.text || label;

  return (
    <TimelineItemLabel 
      icon={Type}
      label={textToDisplay}
      defaultLabel="TEXT"
      isHovering={isHovering}
    />
  );
}; 