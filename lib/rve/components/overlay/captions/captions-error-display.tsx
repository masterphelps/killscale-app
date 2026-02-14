import React from "react";
import { AlertTriangle, FileX, Clock, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Alert, AlertDescription } from "../../ui/alert";

interface SRTParseError {
  type: 'validation' | 'format' | 'timing' | 'encoding';
  message: string;
  line?: number;
  details?: string;
}

interface CaptionsErrorDisplayProps {
  errors: SRTParseError[];
  fileName?: string;
  onRetry?: () => void;
}

const getErrorIcon = (type: SRTParseError['type']) => {
  switch (type) {
    case 'validation':
      return <FileX className="w-4 h-4" />;
    case 'format':
      return <AlertTriangle className="w-4 h-4" />;
    case 'timing':
      return <Clock className="w-4 h-4" />;
    case 'encoding':
      return <Info className="w-4 h-4" />;
    default:
      return <AlertTriangle className="w-4 h-4" />;
  }
};



const getErrorTitle = (type: SRTParseError['type']) => {
  switch (type) {
    case 'validation':
      return 'Validation Error';
    case 'format':
      return 'Format Error';
    case 'timing':
      return 'Timing Error';
    case 'encoding':
      return 'Encoding Error';
    default:
      return 'Error';
  }
};

export const CaptionsErrorDisplay: React.FC<CaptionsErrorDisplayProps> = ({
  errors,
  fileName,
  onRetry,
}) => {
  if (!errors || errors.length === 0) {
    return null;
  }

  const errorsByType = errors.reduce((acc, error) => {
    if (!acc[error.type]) {
      acc[error.type] = [];
    }
    acc[error.type].push(error);
    return acc;
  }, {} as Record<string, SRTParseError[]>);

  const hasValidationErrors = errors.some(e => e.type === 'validation');
  const hasFormatErrors = errors.some(e => e.type === 'format');

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          SRT File Parsing Failed
        </CardTitle>
        {fileName && (
          <p className="text-sm text-muted-foreground">
            File: <span className="font-mono">{fileName}</span>
          </p>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Summary */}
        <Alert>
          <AlertDescription>
            Found {errors.length} error{errors.length !== 1 ? 's' : ''} in the SRT file. 
            {hasValidationErrors || hasFormatErrors 
              ? ' Please fix these issues and try again.'
              : ' Some subtitles may have been skipped.'
            }
          </AlertDescription>
        </Alert>

        {/* Error Details by Type */}
        <div className="space-y-3">
          {Object.entries(errorsByType).map(([type, typeErrors]) => (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2">
                {getErrorIcon(type as SRTParseError['type'])}
                <h4 className="font-extralight text-sm">
                  {getErrorTitle(type as SRTParseError['type'])}
                </h4>
                <span className="inline-flex items-center px-2 py-1 text-xs font-extralight bg-destructive/10 text-destructive rounded-full">
                  {typeErrors.length}
                </span>
              </div>
              
              <div className="space-y-1 ml-6">
                {typeErrors.map((error, index) => (
                  <div key={index} className="text-sm">
                    <div className="flex items-start gap-2">
                      {error.line && (
                        <span className="inline-flex items-center px-2 py-1 text-xs font-mono bg-muted/50 text-muted-foreground border rounded">
                          Line {error.line}
                        </span>
                      )}
                      <span className="text-muted-foreground">{error.message}</span>
                    </div>
                    {error.details && (
                      <div className="mt-1 ml-2 text-xs text-muted-foreground/80 font-mono bg-muted/50 p-2 rounded">
                        {error.details}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Common Solutions */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <h4 className="font-extralight text-sm mb-2">Common Solutions:</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Ensure your SRT file follows the standard format</li>
            <li>• Check that timestamps use the format HH:MM:SS,mmm → HH:MM:SS,mmm</li>
            <li>• Verify that subtitle numbers are sequential</li>
            <li>• Make sure each subtitle block is separated by a blank line</li>
            <li>• Ensure start times are before end times</li>
          </ul>
        </div>

        {/* Example Format */}
        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
          <h4 className="font-extralight text-sm mb-2">Expected SRT Format:</h4>
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">
{`1
00:00:01,000 --> 00:00:03,500
This is the first subtitle

2
00:00:04,000 --> 00:00:06,000
This is the second subtitle`}
          </pre>
        </div>

        {onRetry && (
          <div className="flex justify-end pt-2">
            <button
              onClick={onRetry}
              className="text-sm text-primary hover:text-primary/80 underline"
            >
              Try Another File
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}; 