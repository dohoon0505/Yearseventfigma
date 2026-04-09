import { useState } from "react";
import { Check } from "lucide-react";

export default function Component() {
  const [isChecked, setIsChecked] = useState(false);

  const handleToggle = () => {
    setIsChecked(!isChecked);
  };

  return (
    <button
      onClick={handleToggle}
      className={`w-[22px] h-[22px] flex items-center justify-center border-2 rounded cursor-pointer transition-all ${
        isChecked
          ? "bg-yellow-400 border-yellow-400"
          : "bg-white border-gray-300 hover:border-yellow-300"
      }`}
      aria-checked={isChecked}
      role="checkbox"
    >
      {isChecked && <Check className="w-4 h-4 text-gray-800" strokeWidth={3} />}
    </button>
  );
}