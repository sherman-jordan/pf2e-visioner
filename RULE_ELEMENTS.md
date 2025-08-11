# PF2e Visioner Rule Elements

## PF2eVisionerVisibility Rule Element

The PF2eVisionerVisibility rule element allows you to programmatically change visibility statuses and apply ephemeral effects.

### Usage

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "set",
  "status": "hidden",
  "durationRounds": 10
}
```

### Properties

- **key** `string` - Must be "PF2eVisionerVisibility".
- **subject** `string` - Who is being affected by the visibility change:
  - `"self"` - The actor with this rule element
- **observers** `string` - Who is observing the subject:
  - `"all"` - All tokens on the canvas
  - `"allies"` - Tokens allied with the subject
  - `"enemies"` - Tokens hostile to the subject
  - `"selected"` - Currently selected tokens
  - `"targeted"` - Currently targeted tokens
- **direction** `string` - The direction of the visibility effect:
  - `"from"` - The subject is hidden FROM the observers (observers see subject)
    - Ephemeral effects are applied to the subject token
  - `"to"` - The subject is hidden TO the observers (subject sees observers)
    - Ephemeral effects are applied to the observer tokens
- **mode** `string` - How to change visibility:
  - `"set"` - Set to a specific status
  - `"increase"` - Make less visible (observed → concealed → hidden → undetected)
  - `"decrease"` - Make more visible (undetected → hidden → concealed → observed)
  - `"remove"` - Reset to observed and remove all effects
- **status** `string` - The visibility status to set (when mode is "set"):
  - `"observed"` - Subject is fully visible
  - `"concealed"` - Subject is partially obscured (DC 5 flat check)
  - `"hidden"` - Subject's location is known but not visible (DC 11 flat check)
  - `"undetected"` - Subject's location and presence are unknown
- **steps** `number` - Number of steps to increase/decrease visibility (when mode is "increase" or "decrease")
- **durationRounds** `number` - How many rounds the visibility effect should last.
- **requiresInitiative** `boolean` - Whether the effect requires initiative to be tracked.
- **range** `number` - Maximum range in feet to apply the effect.
- **predicate** `array` - Conditions that must be met for the rule element to apply.

### How It Works

The PF2eVisionerVisibility rule element establishes a relationship between:

1. A **subject** (who is being seen)
2. **Observers** (who are doing the seeing)
3. A **direction** (which way the visibility effect applies)

When the rule element is active, it applies the specified visibility change based on the direction:

- With `"from"` direction: The subject is hidden FROM the observers (observers see subject as hidden/undetected)
- With `"to"` direction: The subject is hidden TO the observers (subject sees observers as hidden/undetected)

For both directions, ephemeral effects are applied to the subject token for consistent behavior.

### Examples

#### Hide Yourself (FROM direction)

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "all",
  "direction": "from",
  "mode": "set",
  "status": "hidden",
  "durationRounds": 10
}
```

This rule element makes you hidden to all observers. Ephemeral effects are applied to your token (the subject).

#### Enhanced Vision (TO direction)

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "all",
  "direction": "to",
  "mode": "decrease",
  "steps": 1,
  "durationRounds": 10
}
```

This rule element improves how you see other creatures (you see them more clearly). Ephemeral effects are applied to your token (the subject).

#### Gradually Become Less Visible (FROM direction)

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "increase",
  "steps": 1,
  "durationRounds": 10
}
```

This rule element makes you one step less visible to enemies (observed → concealed → hidden → undetected). Ephemeral effects are applied to your token (the subject).

#### Remove All Visibility Effects

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "all",
  "direction": "from",
  "mode": "remove"
}
```

This rule element resets all visibility states to observed and removes all related effects. Useful for cleaning up after an encounter or when visibility effects need to be cleared.

#### Hide From Targeted Tokens

```json
{
  "key": "PF2eVisionerVisibility",
  "subject": "self",
  "observers": "targeted",
  "direction": "from",
  "mode": "set",
  "status": "hidden",
  "durationRounds": 10
}
```

This rule element makes you hidden to currently targeted tokens. This allows for quick application of visibility effects to specific tokens without having to select them.

### Roll Options

The PF2eVisionerVisibility rule element adds the following roll options:

- `visibility:observed`
- `visibility:concealed`
- `visibility:hidden`
- `visibility:undetected`
- `visibility:direction:from`
- `visibility:direction:to`

It also adds relationship-specific roll options:

- `visibility:ally:concealed`
- `visibility:ally:hidden`
- `visibility:ally:undetected`
- `visibility:enemy:concealed`
- `visibility:enemy:hidden`
- `visibility:enemy:undetected`

These roll options can be used in other rule elements to create conditional effects.
