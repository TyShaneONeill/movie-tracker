import React from 'react';
import { RatingSlider } from '@pocketstubs/design-system';

const Box = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 320, padding: 12 }}>{children}</div>
);

export const Rated = () => (
  <Box>
    <RatingSlider value={8.5} step={0.5} onChange={() => {}} />
  </Box>
);

export const UnsetFirstTouch = () => (
  <Box>
    <RatingSlider value={5} unset onChange={() => {}} />
  </Box>
);

export const Disabled = () => (
  <Box>
    <RatingSlider value={6} disabled onChange={() => {}} />
  </Box>
);
