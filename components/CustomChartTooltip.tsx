// components/CustomChartTooltip.tsx
import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

// This interface matches the props Recharts' Tooltip passes to its `content` prop.
// 'coordinate' is crucial for positioning our custom tooltip relative to the mouse/data point.
interface CustomTooltipContentProps extends TooltipProps<ValueType, NameType> {
  coordinate?: { x: number; y: number }; // Recharts provides this when 'active'
}

const CustomChartTooltip: React.FC<CustomTooltipContentProps> = ({ active, payload, label, coordinate }) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const portalNodeRef = useRef<HTMLElement | null>(null);

  // Effect to create and manage the portal root element in the DOM
  useEffect(() => {
    // Attempt to find an existing portal node
    let node = document.getElementById('recharts-tooltip-portal');
    if (!node) {
      // If not found, create it and append to body
      node = document.createElement('div');
      node.id = 'recharts-tooltip-portal';
      document.body.appendChild(node);
    }
    portalNodeRef.current = node;

    // Optional Cleanup: Remove the portal node when the component unmounts
    // This is generally good practice, but for a global tooltip portal, you might
    // prefer it to persist throughout the app's lifecycle if multiple charts use it.
    // For this example, we'll keep a simple cleanup.
    return () => {
      // Check if this specific component created it and it's still in the DOM
      // This helps prevent issues if multiple components try to manage the same node.
      if (node && document.body.contains(node) && node.id === 'recharts-tooltip-portal') {
        // You might want a more sophisticated check if multiple charts
        // could unmount and try to remove the same portal root.
        // For a single, main chart, this is usually fine.
      }
    };
  }, []); // Run only once on mount

  // Effect to position the tooltip
  useEffect(() => {
    if (active && tooltipRef.current && coordinate) {
      const tooltipEl = tooltipRef.current;
      const { x, y } = coordinate;

      // Get viewport dimensions
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Get tooltip dimensions (ensure it's visible to get dimensions)
      tooltipEl.style.visibility = 'hidden'; // Hide temporarily to calculate
      tooltipEl.style.display = 'block';    // Ensure display is block for measurement
      const tooltipWidth = tooltipEl.offsetWidth;
      const tooltipHeight = tooltipEl.offsetHeight;
      tooltipEl.style.display = ''; // Reset display

      let newX = x + 15; // Offset from mouse/data point
      let newY = y + 15;

      // Adjust X position if it overflows to the right
      if (newX + tooltipWidth > viewportWidth - 20) { // 20px padding from right edge
        newX = x - tooltipWidth - 15; // Position to the left of the point
      }
      // Ensure it doesn't go off the left side
      if (newX < 10) {
        newX = 10;
      }

      // Adjust Y position if it overflows to the bottom
      if (newY + tooltipHeight > viewportHeight - 20) { // 20px padding from bottom edge
        newY = y - tooltipHeight - 15; // Position above the point
      }
      // Ensure it doesn't go off the top side
      if (newY < 10) {
        newY = 10;
      }

      tooltipEl.style.left = `${newX}px`;
      tooltipEl.style.top = `${newY}px`;
      tooltipEl.style.position = 'fixed'; // Use 'fixed' to position relative to viewport
      tooltipEl.style.zIndex = '9999'; // Ensure it's on top of everything
      tooltipEl.style.visibility = 'visible'; // Make visible after positioning
      tooltipEl.style.opacity = '1'; // Ensure opacity is 1
    } else if (tooltipRef.current) {
      // Hide tooltip when not active
      tooltipRef.current.style.visibility = 'hidden';
      tooltipRef.current.style.opacity = '0';
    }
  }, [active, coordinate, payload]); // Re-run when active, coordinate, or payload changes

  if (!active || !payload || !payload.length || !portalNodeRef.current) {
    return null;
  }

  // Safely access score from the first payload item
  const score = payload[0]?.payload?.score;

  const content = (
    <div
      ref={tooltipRef}
      className="recharts-custom-portal-tooltip" // Apply your custom styling via CSS
      style={{
        backgroundColor: 'rgba(51, 51, 51, 0.95)', // Slightly transparent background
        borderColor: '#555',
        border: '1px solid',
        color: '#fff',
        borderRadius: '8px', // More rounded corners
        padding: '12px',     // More padding
        pointerEvents: 'none', // Prevent tooltip from interfering with mouse events on chart
        transition: 'opacity 0.2s ease-in-out', // Optional: smooth fade in/out
        opacity: 0, // Initial state, controlled by useEffect
        visibility: 'hidden', // Initial state, controlled by useEffect
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)', // Add a subtle shadow
        minWidth: '120px', // Minimum width for better readability
        textAlign: 'left',
      }}
    >
      <p className="font-bold text-gray-100 text-base mb-2">{label}</p>
      {score !== undefined && (typeof score === 'number' ? (
        <p className="text-sm">Score: <span className="font-bold">{score.toFixed(1)}/10</span></p>
      ) : (
        <p className="text-sm">Score: N/A</p>
      ))}
      {/* You can add more details from payload if needed */}
      {payload.map((entry, index) => (
        <div key={`tooltip-item-${index}`} className="flex justify-between items-center text-xs mt-1">
          <span style={{ color: entry.color || '#ccc' }}>{entry.name}:</span>
          <span className="ml-2 font-semibold">
            {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );

  return ReactDOM.createPortal(content, portalNodeRef.current);
};

export default CustomChartTooltip;
