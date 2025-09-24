import React from 'react';
import './Tooltip.css';

const Tooltip = ({ text, children }) => {
  return (
    <div className="tooltip-container">
      {children}
      <div className="tooltip-box">
        {text}
      </div>
    </div>
  );
};

export default Tooltip;