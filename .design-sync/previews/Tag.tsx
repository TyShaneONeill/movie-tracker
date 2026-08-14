import React from 'react';
import { Tag } from '@pocketstubs/design-system';

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{children}</div>
);

export const GenreTags = () => (
  <Row>
    <Tag label="Sci-Fi" />
    <Tag label="Thriller" />
    <Tag label="Drama" />
    <Tag label="Horror" />
  </Row>
);

export const ActiveFilter = () => (
  <Row>
    <Tag label="All" active onPress={() => {}} />
    <Tag label="Movies" onPress={() => {}} />
    <Tag label="TV Shows" onPress={() => {}} />
  </Row>
);

export const DisabledState = () => (
  <Row>
    <Tag label="IMAX" disabled />
    <Tag label="4DX" disabled active />
  </Row>
);
