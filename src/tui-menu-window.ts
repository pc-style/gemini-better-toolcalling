export interface MenuWindow {
  start: number;
  end: number;
}

export function getMenuWindow(
  optionCount: number,
  selectedIndex: number,
  maxVisible: number,
): MenuWindow {
  if (optionCount <= 0 || maxVisible <= 0) {
    return { start: 0, end: 0 };
  }

  const clampedSelected = Math.min(Math.max(selectedIndex, 0), optionCount - 1);
  const visibleCount = Math.min(maxVisible, optionCount);
  const halfWindow = Math.floor(visibleCount / 2);

  let start = clampedSelected - halfWindow;
  if (start < 0) {
    start = 0;
  }

  let end = start + visibleCount;
  if (end > optionCount) {
    end = optionCount;
    start = end - visibleCount;
  }

  return { start, end };
}
