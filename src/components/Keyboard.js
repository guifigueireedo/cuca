import React from 'react';
import './Keyboard.css';

const Keyboard = ({ onKeyPress, onEnter, onDelete, keyStatuses = {}, isReversed = false }) => {
  const keys1 = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
  const keys2 = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
  const keys3 = ["enter", "z", "x", "c", "v", "b", "n", "m", "⌫"];

  const handleKeyPress = (key) => {
    if (key === "enter") {
      onEnter();
    } else if (key === "⌫") {
      onDelete();
    } else {
      onKeyPress(key);
    }
  };

  const renderKeyRow = (keys) => {
    const rowKeys = isReversed ? [...keys].reverse() : keys;
    return (
      <div className="keyboard-row">
        {rowKeys.map((key) => {
          const status = keyStatuses[key];
          return (
            <button
              key={key}
              className={`key ${key.length > 1 ? 'special' : ''} ${status || ''}`}
              onClick={() => handleKeyPress(key)}
            >
              {key === '⌫' ? key : (isReversed ? key.split('').reverse().join('') : key)}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="keyboard">
      {renderKeyRow(keys1)}
      {renderKeyRow(keys2)}
      {renderKeyRow(keys3)}
    </div>
  );
};

export default Keyboard;