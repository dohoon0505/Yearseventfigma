import React, { useState } from "react";
import { defineProperties } from "figma:react";

export default function TextField({
  placeholder = "비밀번호를 입력해주세요",
  disabled = false,
  // Default state colors
  defaultTextColor = "#C8C8C8",
  defaultBorderColor = "#B9B9B9",
  defaultBgColor = "transparent",
  // Hover state colors
  hoverTextColor = "#222",
  hoverBorderColor = "#222",
  hoverBgColor = "transparent",
  // Completed state colors
  completedTextColor = "#222",
  completedBorderColor = "#85C83E",
  completedBgColor = "transparent",
  // Typing state colors
  typingTextColor = "#222",
  typingBorderColor = "#3688FF",
  typingBgColor = "transparent",
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [value, setValue] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleChange = (e) => {
    setValue(e.target.value);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  // Determine the current state for styling
  const isFilled = value.length > 0;
  const isTyping = isFocused; // 입력중 상태 (focus된 상태)
  const isCompleted = !isFocused && isFilled; // 입력 완료 상태 (포커스 아웃 + 값 존재)

  return (
    <div className="w-full relative">
      <input
        type={showPassword ? "text" : "password"}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        placeholder={placeholder}
        className={`w-full h-[55px] pl-[15px] text-base outline-none transition-all duration-300 ease-in-out pr-[40px] ${
          disabled
            ? "cursor-not-allowed pointer-events-none"
            : ""
        } ${isCompleted ? "font-['Pretendard-Regular']" : "font-['Pretendard-Light']"}`}
        style={{
          fontFamily: disabled
            ? "Pretendard-Light"
            : isCompleted
              ? "Pretendard-Regular"
              : "Pretendard-Light",
          paddingRight: isCompleted ? "70px" : "40px",
          color: disabled
            ? defaultTextColor
            : isCompleted
              ? completedTextColor
              : isTyping
                ? typingTextColor
                : isHovered
                  ? hoverTextColor
                  : defaultTextColor,
          backgroundColor: disabled
            ? "#FDFDFD"
            : isCompleted
              ? completedBgColor
              : isTyping
                ? typingBgColor
                : isHovered
                  ? hoverBgColor
                  : defaultBgColor,
          border: `1px solid ${disabled ? defaultBorderColor : isCompleted ? completedBorderColor : isTyping ? typingBorderColor : isHovered ? hoverBorderColor : defaultBorderColor}`,
        }}
      />

      {/* Password visibility toggle button */}
      {!disabled && (
        <button
          type="button"
          onClick={togglePasswordVisibility}
          className={`absolute top-1/2 transform -translate-y-1/2 ${isCompleted ? "right-[40px]" : "right-3"} cursor-pointer`}
        >
          {showPassword ? (
            // Eye icon (visible)
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z"
                stroke="#222222"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
                stroke="#222222"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            // Eye-off icon (hidden)
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M9.9 4.24002C10.5883 4.0789 11.2931 3.99836 12 4.00002C19 4.00002 23 12 23 12C22.393 13.1356 21.6691 14.2048 20.84 15.19M14.12 14.12C13.8454 14.4148 13.5141 14.6512 13.1462 14.8151C12.7782 14.9791 12.3809 15.0673 11.9781 15.0744C11.5753 15.0815 11.1752 15.0074 10.8016 14.8565C10.4281 14.7056 10.0887 14.4811 9.80385 14.1962C9.51897 13.9113 9.29439 13.572 9.14351 13.1984C8.99262 12.8249 8.91853 12.4247 8.92563 12.0219C8.93274 11.6191 9.02091 11.2219 9.18488 10.8539C9.34884 10.4859 9.58525 10.1547 9.88 9.88002M1 1.00002L23 23M17.94 17.94C16.2306 19.243 14.1491 19.9649 12 20C5 20 1 12 1 12C2.24389 9.68192 3.96914 7.65663 6.06 6.06002L17.94 17.94Z"
                stroke="#222222"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}

      {/* Completed icon */}
      {isCompleted && !disabled && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clipPath="url(#clip0_63_8599)">
              <path
                d="M20 0H0V20H20V0Z"
                fill="white"
                fillOpacity="0.01"
              />
              <path
                d="M10.0001 1.66669L12.1889 3.26337L14.8983 3.25821L15.7306 5.83656L17.9255 7.4249L17.0834 10L17.9255 12.5751L15.7306 14.1635L14.8983 16.7418L12.1889 16.7367L10.0001 18.3334L7.81118 16.7367L5.10185 16.7418L4.26951 14.1635L2.07458 12.5751L2.91672 10L2.07458 7.4249L4.26951 5.83656L5.10185 3.25821L7.81118 3.26337L10.0001 1.66669Z"
                fill="#85C83E"
              />
              <path
                d="M7.08337 10L9.16671 12.0834L13.3334 7.91669"
                stroke="white"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
            <defs>
              <clipPath id="clip0_63_8599">
                <rect width="20" height="20" fill="white" />
              </clipPath>
            </defs>
          </svg>
        </span>
      )}
    </div>
  );
}

defineProperties(TextField, {
  placeholder: {
    label: "Placeholder Text",
    type: "string",
    defaultValue: "비밀번호를 입력해주세요",
  },
  disabled: {
    label: "Disabled",
    type: "boolean",
    defaultValue: false,
  },
  // Default colors
  defaultTextColor: {
    label: "Default Text Color",
    type: "string",
    defaultValue: "#C8C8C8",
  },
  defaultBorderColor: {
    label: "Default Border Color",
    type: "string",
    defaultValue: "#B9B9B9",
  },
  defaultBgColor: {
    label: "Default Background Color",
    type: "string",
    defaultValue: "transparent",
  },
  // Hover colors
  hoverTextColor: {
    label: "Hover Text Color",
    type: "string",
    defaultValue: "#222",
  },
  hoverBorderColor: {
    label: "Hover Border Color",
    type: "string",
    defaultValue: "#222",
  },
  hoverBgColor: {
    label: "Hover Background Color",
    type: "string",
    defaultValue: "transparent",
  },
  // Completed colors
  completedTextColor: {
    label: "Completed Text Color",
    type: "string",
    defaultValue: "#222",
  },
  completedBorderColor: {
    label: "Completed Border Color",
    type: "string",
    defaultValue: "#85C83E",
  },
  completedBgColor: {
    label: "Completed Background Color",
    type: "string",
    defaultValue: "transparent",
  },
  // Typing colors
  typingTextColor: {
    label: "Typing Text Color",
    type: "string",
    defaultValue: "#222",
  },
  typingBorderColor: {
    label: "Typing Border Color",
    type: "string",
    defaultValue: "#3688FF",
  },
  typingBgColor: {
    label: "Typing Background Color",
    type: "string",
    defaultValue: "transparent",
  },
});