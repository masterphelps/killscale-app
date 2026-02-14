"use client";

import React from 'react';
import { Button } from '../ui/button';

interface ProjectLoadConfirmModalProps {
  isVisible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ProjectLoadConfirmModal: React.FC<ProjectLoadConfirmModalProps> = ({ 
  isVisible, 
  onConfirm, 
  onCancel 
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    >
      <div 
        className="bg-background border shadow-lg rounded-lg max-w-lg w-full p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-load-confirm-title"
      >
        {/* Title */}
        <h2 
          id="project-load-confirm-title"
          className="text-lg font-normal text-foreground mb-2"
        >
          Load Project?
        </h2>

        {/* Message */}
        <div className="text-sm font-extralight text-muted-foreground mb-4">
          <p>
            You have <span className="font-extralight text-foreground">existing saved work</span>.
 
            Loading this project will replace your current changes. This action cannot be undone.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
          <Button
            onClick={onCancel}
            variant="outline"
            className="mt-2 sm:mt-0"
          >
            Keep My Work
          </Button>
          <Button
            onClick={onConfirm}
            variant="default"
          >
            Load Project
          </Button>
        </div>
      </div>
    </div>
  );
};

