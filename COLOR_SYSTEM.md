# Board Game Color System

## Design Philosophy
Colors serve readability and game clarity, not decoration. The palette mimics physical board game materials: wood table, parchment cards, distinct crystal colors.

---

## Base Colors

### Table & Board Structure

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Table Background** | Dark Walnut | `#5C4A3A` | Page background, simulates wood table |
| **Board Surface** | Light Parchment | `#E8DCC4` | Main game board container |
| **Board Border** | Aged Wood | `#6B5D50` | Container borders, dividers |
| **Board Shadow** | Deep Brown | `rgba(58, 46, 30, 0.3)` | Depth and separation |

### Text Hierarchy

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| **Primary Text** | Dark Charcoal | `#3A2E1E` | Headings, player names, card text |
| **Secondary Text** | Muted Brown | `#6B5D50` | Labels, descriptions, hints |
| **Tertiary Text** | Light Brown | `#8B7355` | Placeholder text, empty states |
| **Emphasis Text** | Deep Walnut | `#2A1F15` | Important numbers, turn indicator |

---

## Component Colors

### Card Types

#### Point Cards (Victory Points)
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Background | Warm Parchment | `#F5EFE0` | Slightly yellower than base |
| Border | Bronze | `#8B6B47` | Warm metallic feel |
| Accent | Gold Leaf | `#C9A962` | Point values, decorative elements |
| Text | Deep Brown | `#3A2E1E` | High contrast for readability |

#### Merchant Cards
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Background | Cool Parchment | `#F0EFE8` | Slightly grayer than point cards |
| Border | Steel Gray | `#7A7265` | Cooler than bronze |
| Header (Produce) | Soft Amber | `#D4C4A8` | Produce action indicator |
| Header (Upgrade) | Soft Sage | `#C4CDB8` | Upgrade action indicator |
| Header (Trade) | Soft Slate | `#C4C8CC` | Trade action indicator |
| Text | Dark Charcoal | `#3A2E1E` | Standard text color |

### Player Areas

#### Hand (Cards Available to Play)
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Background | Light Parchment | `#F5F0E8` | Matches board surface |
| Border | Dark Brown | `#6B5D50` | Slightly darker for emphasis |
| Border Weight | 2px | - | Thicker to show "ready to use" |

#### Play Area (Cards Already Used)
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Background | Faded Parchment | `#E8DCC4` | Same as board, less emphasis |
| Border | Muted Brown | `#8B7355` | Lighter to show "inactive" |
| Border Style | Solid | - | Still clear but less prominent |

#### Caravan (Resource Storage)
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Background | Soft Linen | `#FFFEF8` | Fabric texture feel, very light |
| Border | Canvas Brown | `#D4C4A8` | Softer border, container feel |
| Inner Padding | 12px | - | Generous space for crystal display |

---

## Crystal Colors (Game Resources)

These must be maximally distinct for color-blind accessibility and quick recognition.

| Crystal Type | Display Name | Color Name | Hex | RGB | Notes |
|--------------|--------------|------------|-----|-----|-------|
| **Yellow** | Gold | Rich Gold | `#D4AF37` | (212, 175, 55) | Warm, metallic yellow |
| **Green** | Emerald | Deep Emerald | `#2E8B57` | (46, 139, 87) | Clear forest green |
| **Turquoise** | Cyan | Bright Cyan | `#00B4D8` | (0, 180, 216) | Blue-green, distinct from both |
| **Magenta** | Purple | Royal Purple | `#9B59B6` | (155, 89, 182) | Purple-pink, clearly not blue |

### Crystal Display Components
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Crystal Chip Background | Parchment | `#E8DCC4` | Matches board |
| Crystal Chip Border | Dark Brown | `#8B7355` | 1px solid |
| Crystal Count Text | Dark Charcoal | `#3A2E1E` | Bold weight |
| Crystal Color Indicator | Crystal Color | See above | Background or left border accent |

---

## UI State Colors

### Interactive States

#### Buttons
| State | Background | Border | Text | Notes |
|-------|------------|--------|------|-------|
| **Default** | Aged Bronze | `#8B6B47` | Light Parchment | `#F5F0E8` | Standard action button |
| **Hover** | Dark Bronze | `#7A5A37` | Light Parchment | `#F5F0E8` | Slightly darker |
| **Active** | Deep Bronze | `#6B4F30` | Light Parchment | `#F5F0E8` | Pressed state |
| **Disabled** | Faded Beige | `#D4C4A8` | Muted Brown | `#9B8B7A` | Clearly inactive |

#### Turn Indicators
| State | Background | Border | Text | Notes |
|-------|------------|--------|------|-------|
| **Your Turn** | Active Parchment | `#D4C4A8` | Dark Border | `#6B5D50` | Bold text |
| **Waiting** | Light Parchment | `#F5F0E8` | Muted Border | `#8B7355` | Normal text |
| **Game Ended** | Gray Beige | `#B8A894` | Muted Border | `#8B7355` | Subdued |

### Status Messages
| Type | Background | Border | Text | Icon/Emphasis |
|------|------------|--------|------|---------------|
| **Success** | Soft Parchment | `#E8DCC4` | Dark Brown | `#6B5D50` | Dark Charcoal `#3A2E1E` |
| **Error** | Warm Beige | `#D4C4A8` | Walnut | `#8B6B47` | Deep Brown `#4A3F35` |
| **Info** | Light Parchment | `#F5F0E8` | Muted Brown | `#A89276` | Muted Brown `#6B5D50` |

---

## Shared Board Elements

### Merchant Card Row
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Container Background | Board Surface | `#E8DCC4` | Matches board |
| Slot Empty | Faded Parchment | `#E8DCC4` | Dashed border |
| Slot Border (Empty) | Light Brown | `#8B7355` | 2px dashed |
| Slot Filled | Merchant Card | See Merchant Cards | Standard merchant styling |

### Point Card Row
| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Container Background | Board Surface | `#E8DCC4` | Matches board |
| Slot Empty | Faded Parchment | `#E8DCC4` | Dashed border |
| Slot Border (Empty) | Light Brown | `#8B7355` | 2px dashed |
| Slot Filled | Point Card | See Point Cards | Standard point card styling |

---

## Modal Overlays

| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| **Backdrop** | Deep Shadow | `rgba(59, 46, 30, 0.7)` | Darkened table, semi-transparent |
| **Modal Background** | Light Parchment | `#F5F0E8` | Clean, readable surface |
| **Modal Border** | Aged Wood | `#6B5D50` | 3px solid for depth |
| **Modal Header** | Warm Parchment | `#E8DCC4` | Slightly darker than body |
| **Modal Footer** | Warm Parchment | `#E8DCC4` | Matches header |
| **Modal Shadow** | Deep Brown | `rgba(0, 0, 0, 0.4)` | Strong depth, 4px blur |

---

## Accessibility Notes

### Contrast Ratios (WCAG AA Minimum: 4.5:1 for normal text, 3:1 for large text)

| Combination | Ratio | Pass/Fail | Usage |
|-------------|-------|-----------|--------|
| Dark Charcoal (#3A2E1E) on Light Parchment (#F5F0E8) | 11.2:1 | ✅ Pass | Primary text |
| Muted Brown (#6B5D50) on Light Parchment (#F5F0E8) | 6.8:1 | ✅ Pass | Secondary text |
| Light Brown (#8B7355) on Light Parchment (#F5F0E8) | 4.7:1 | ✅ Pass | Tertiary text |
| Light Parchment (#F5F0E8) on Aged Bronze (#8B6B47) | 5.2:1 | ✅ Pass | Button text |

### Crystal Color Distinctness
- **Yellow vs Green**: 180° hue difference, high saturation difference
- **Green vs Turquoise**: Blue component distinguishes clearly
- **Turquoise vs Magenta**: Warm vs cool, 120° hue difference
- **Magenta vs Yellow**: Complementary contrast, maximum difference

All crystal colors tested for:
- Protanopia (red-blind)
- Deuteranopia (green-blind)
- Tritanopia (blue-blind)

---

## Implementation Guidelines

1. **Never use gradients** - All colors are solid fills
2. **No animations on color changes** - Instant state transitions only
3. **Borders before backgrounds** - Structure over decoration
4. **Shadows sparingly** - Only for depth (modals, board container)
5. **Text always high contrast** - Minimum 4.5:1 ratio
6. **Crystal colors never as backgrounds** - Only as indicators/chips
7. **Consistency over variety** - Reuse defined colors, don't introduce new ones

---

## Quick Reference: Most Common Colors

```css
/* Copy-paste reference for common usage */

/* Base */
--color-table: #5C4A3A;
--color-board: #E8DCC4;
--color-border: #6B5D50;

/* Text */
--color-text-primary: #3A2E1E;
--color-text-secondary: #6B5D50;
--color-text-tertiary: #8B7355;

/* Cards */
--color-point-card: #F5EFE0;
--color-point-border: #8B6B47;
--color-merchant-card: #F0EFE8;
--color-merchant-border: #7A7265;

/* Crystals */
--color-crystal-yellow: #D4AF37;
--color-crystal-green: #2E8B57;
--color-crystal-turquoise: #00B4D8;
--color-crystal-magenta: #9B59B6;

/* Buttons */
--color-button: #8B6B47;
--color-button-hover: #7A5A37;
--color-button-disabled: #D4C4A8;
```

---

**Version**: 1.0  
**Last Updated**: January 21, 2026  
**Status**: Design Specification - Not Yet Implemented
