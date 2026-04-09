import { defineProperties } from "figma:react";
import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";

export default function CustomTextField({
  placeholder = "텍스트를 입력하세요",
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
  errorBorderColor = "#FF4D4F",
}) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isError, setIsError] = useState(false);
  const errorTimer = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Check if input is completed when value changes
  useEffect(() => {
    if (value.trim() !== "") {
      setIsCompleted(true);
    } else {
      setIsCompleted(false);
    }
  }, [value]);

  // Determine current state for styling
  const getBorderColor = () => {
    if (isError) return errorBorderColor;
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

  return (
    <div 
      className="relative w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          const digitsOnly = e.target.value.replace(/\D/g, "");
          if (digitsOnly.length !== e.target.value.length) {
            // invalid char detected
            if (errorTimer.current) clearTimeout(errorTimer.current);
            setIsError(true);
            errorTimer.current = setTimeout(() => setIsError(false), 800);
          }
          setValue(digitsOnly);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className="w-full h-[55px] pl-[15px] pr-[40px] text-[16px] outline-none transition-all duration-300 ease-in-out"
        style={{
          border: `1px solid ${getBorderColor()}`,
          color: getTextColor(),
          fontFamily: isCompleted && !isFocused ? "Pretendard Regular, sans-serif" : "Pretendard Light, sans-serif",
        }}
      />
      
      {/* Completed state icon */}
      {isCompleted && !isFocused && (
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
    {/* Error label */}
      {isError && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="absolute left-0 top-full mt-1 text-red-500 text-[12px]"
        >
          숫자만 입력이 가능합니다.
        </motion.div>
      )}
    </div>
  );
}

defineProperties(CustomTextField, {
  placeholder: {
    label: "Placeholder Text",
    type: "string",
    defaultValue: "텍스트를 입력하세요"
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
    defaultValue: "#FF4D4F"
  }
});