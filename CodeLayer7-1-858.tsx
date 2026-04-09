import { defineProperties } from "figma:react";
import { useState, useRef, useEffect } from "react";

export default function CustomTextField({
  placeholder = "영문, 숫자만 입력 가능합니다",
  defaultBorderColor = "#B9B9B9",
  defaultTextColor = "#C8C8C8",
  hoverBorderColor = "#222",
  hoverTextColor = "#222",
  typingBorderColor = "#3688FF",
  typingTextColor = "#222",
  completedBorderColor = "#85C83E",
  completedTextColor = "#222",
  iconColor = "#85C83E",
  iconCheckColor = "#FFFFFF",
  errorBorderColor = "#FF3B30",
  errorMessage = "영문 소문자와 숫자만 입력 가능합니다"
}) {
  const [value, setValue] = useState("");
  const [displayValue, setDisplayValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [showError, setShowError] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastValidValueRef = useRef<string>("");
  
  // Regex pattern for allowed characters: lowercase English letters and numbers only
  const validInputPattern = /^[a-z0-9]*$/;

  // Check if input is completed when value changes
  useEffect(() => {
    if (value.trim() !== "") {
      setIsCompleted(true);
    } else {
      setIsCompleted(false);
    }
  }, [value]);

  // Handle error animation timeout
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (showError) {
      timeout = setTimeout(() => {
        setShowError(false);
      }, 800);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [showError]);

  // Handle input change to filter invalid characters
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Filter the input value to only keep valid characters (lowercase letters and numbers)
    const filteredValue = inputValue.replace(/[^a-z0-9]/g, '');

    // Update the visible value with the filtered string so disallowed characters never appear
    setDisplayValue(filteredValue);
    
    // Check if anything was filtered out (meaning there were invalid characters)
    if (filteredValue !== inputValue) {
      setShowError(true);
    }
    
    // Update the valid value
    setValue(filteredValue);
    lastValidValueRef.current = filteredValue;
  };
  
  // When input loses focus, ensure we're showing only valid chars
  const handleBlur = () => {
    setIsFocused(false);
    // Clean any remaining invalid characters
    setDisplayValue(value);
  };
  
  // When input gets focus
  const handleFocus = () => {
    setIsFocused(true);
  };

  // Handle paste events
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const clipboardData = e.clipboardData.getData("text");
    
    // Filter out invalid characters
    const filteredValue = clipboardData.replace(/[^a-z0-9]/g, "");
    
    // Check if anything was filtered
    if (filteredValue !== clipboardData) {
      setShowError(true);
    }
    
    // Insert the filtered text at cursor position
    const cursorPos = inputRef.current?.selectionStart || 0;
    const currentValue = value;
    const newValue = 
      currentValue.substring(0, cursorPos) + 
      filteredValue + 
      currentValue.substring(inputRef.current?.selectionEnd || cursorPos);
    
    // Set the new value
    setValue(newValue);
    setDisplayValue(newValue);
    lastValidValueRef.current = newValue;
    
    // Prevent default paste behavior
    e.preventDefault();
    
    // Set cursor position after pasted text
    setTimeout(() => {
      if (inputRef.current) {
        const newPosition = cursorPos + filteredValue.length;
        inputRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  };

  // Determine current state for styling
  const getBorderColor = () => {
    if (showError) return errorBorderColor;
    if (isFocused) return typingBorderColor;
    if (isCompleted) return completedBorderColor;
    if (isHovered) return hoverBorderColor;
    return defaultBorderColor;
  };

  const getTextColor = () => {
    if (value) {
      if (isCompleted) return completedTextColor;
      return typingTextColor;
    }
    if (isHovered) return hoverTextColor;
    return defaultTextColor;
  };

  // Reset input to only valid characters when composition ends
  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    const composedText = e.currentTarget.value;
    
    // Filter the composed text
    const filteredText = composedText.replace(/[^a-z0-9]/g, '');
    
    // Check if anything was filtered
    if (filteredText !== composedText) {
      setShowError(true);
    }
    
    // Update with filtered text
    setValue(filteredText);
    setDisplayValue(filteredText);
    lastValidValueRef.current = filteredText;
    
    // Ensure cursor is at end
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(filteredText.length, filteredText.length);
      }
    }, 0);
  };

  return (
    <div className="relative w-full">
      <div 
        className="relative w-full"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleInputChange}
          onCompositionEnd={handleCompositionEnd}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="w-full h-[55px] pl-[15px] pr-[40px] text-[16px] outline-none transition-all duration-300 ease-in-out"
          style={{
            border: `1px solid ${getBorderColor()}`,
            color: getTextColor(),
            fontFamily: isCompleted && !isFocused ? "Pretendard Regular, sans-serif" : "Pretendard Light, sans-serif",
            transition: showError ? "border-color 0.2s ease-in-out" : "all 0.3s ease-in-out",
          }}
          // Add recommended input attributes
          inputMode="latin"
          lang="en"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
        />
        
        {/* Completed state icon */}
        {isCompleted && !isFocused && !showError && (
          <div className="absolute right-[15px] top-1/2 transform -translate-y-1/2 transition-opacity duration-300">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clipPath="url(#clip0_63_8599)">
                <path d="M20 0H0V20H20V0Z" fill="white" fillOpacity="0.01"/>
                <path 
                  d="M10.0001 1.66669L12.1889 3.26337L14.8983 3.25821L15.7306 5.83656L17.9255 7.4249L17.0834 10L17.9255 12.5751L15.7306 14.1635L14.8983 16.7418L12.1889 16.7367L10.0001 18.3334L7.81118 16.7367L5.10185 16.7418L4.26951 14.1635L2.07458 12.5751L2.91672 10L2.07458 7.4249L4.26951 5.83656L5.10185 3.25821L7.81118 3.26337L10.0001 1.66669Z" 
                  fill={iconColor}
                />
                <path 
                  d="M7.08337 10L9.16671 12.0834L13.3334 7.91669" 
                  stroke={iconCheckColor} 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                />
              </g>
              <defs>
                <clipPath id="clip0_63_8599">
                  <rect width="20" height="20" fill="white"/>
                </clipPath>
              </defs>
            </svg>
          </div>
        )}
      </div>

      {/* Error message */}
      {showError && (
        <div 
          className="text-[14px] mt-1 text-left ml-2 transition-opacity"
          style={{ 
            color: errorBorderColor,
            fontFamily: "Pretendard, sans-serif",
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

defineProperties(CustomTextField, {
  placeholder: {
    label: "Placeholder Text",
    type: "string",
    defaultValue: "영문, 숫자만 입력 가능합니다"
  },
  defaultBorderColor: {
    label: "Default Border Color",
    type: "string",
    defaultValue: "#B9B9B9"
  },
  defaultTextColor: {
    label: "Default Text Color",
    type: "string",
    defaultValue: "#C8C8C8"
  },
  hoverBorderColor: {
    label: "Hover Border Color",
    type: "string",
    defaultValue: "#222"
  },
  hoverTextColor: {
    label: "Hover Text Color",
    type: "string",
    defaultValue: "#222"
  },
  typingBorderColor: {
    label: "Typing Border Color",
    type: "string",
    defaultValue: "#3688FF"
  },
  typingTextColor: {
    label: "Typing Text Color",
    type: "string",
    defaultValue: "#222"
  },
  completedBorderColor: {
    label: "Completed Border Color",
    type: "string",
    defaultValue: "#85C83E"
  },
  completedTextColor: {
    label: "Completed Text Color",
    type: "string",
    defaultValue: "#222"
  },
  iconColor: {
    label: "Icon Background Color",
    type: "string",
    defaultValue: "#85C83E"
  },
  iconCheckColor: {
    label: "Icon Check Color",
    type: "string",
    defaultValue: "#FFFFFF"
  },
  errorBorderColor: {
    label: "Error Border Color",
    type: "string",
    defaultValue: "#FF3B30"
  },
  errorMessage: {
    label: "Error Message",
    type: "string",
    defaultValue: "영문 소문자와 숫자만 입력 가능합니다"
  }
});