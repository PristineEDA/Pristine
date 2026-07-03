import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ImageWithFallback } from './ImageWithFallback';

describe('ImageWithFallback', () => {
  it('renders the original image before any error', () => {
    render(<ImageWithFallback src="/diagram.png" alt="Diagram" className="hero-image" />);

    const image = screen.getByAltText('Diagram');
    expect(image).toHaveAttribute('src', '/diagram.png');
    expect(image).toHaveClass('hero-image');
  });

  it('shows the fallback image and preserves the original source metadata after an error', () => {
    render(<ImageWithFallback src="/broken.png" alt="Broken" />);

    fireEvent.error(screen.getByAltText('Broken'));

    const fallback = screen.getByAltText('Failed to load');
    expect(fallback).toHaveAttribute('data-original-url', '/broken.png');
    expect(fallback.getAttribute('src')).toContain('data:image/svg+xml;base64');
  });
});
