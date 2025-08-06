# PF2e Visioner Rule Elements

## Visibility Rule Element

The Visibility rule element allows you to programmatically change visibility statuses and apply ephemeral effects.

### Usage

```json
{
  "key": "Visibility",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "set",
  "status": "hidden",
  "applyEphemeralEffects": true,
  "durationRounds": 10
}
```

### Properties

- **key** `string` - Must be "Visibility".
- **subject** `string` - Who is being affected by the visibility change:
  - `"self"` - The actor with this rule element
  - `"target"` - The currently targeted token
- **observers** `string` - Who is observing the subject:
  - `"all"` - All tokens on the canvas
  - `"allies"` - Tokens allied with the subject
  - `"enemies"` - Tokens hostile to the subject
  - `"selected"` - Currently selected tokens
- **direction** `string` - The direction of the visibility effect:
  - `"from"` - The subject is hidden FROM the observers (observers see subject)
    - Ephemeral effects are applied to the subject token
  - `"to"` - The subject is hidden TO the observers (subject sees observers)
    - Ephemeral effects are applied to the observer tokens
- **mode** `string` - How to change visibility:
  - `"set"` - Set to a specific status
  - `"increase"` - Make less visible (observed → concealed → hidden → undetected)
  - `"decrease"` - Make more visible (undetected → hidden → concealed → observed)
- **status** `string` - The visibility status to set (when mode is "set"):
  - `"observed"` - Subject is fully visible
  - `"concealed"` - Subject is partially obscured (DC 5 flat check)
  - `"hidden"` - Subject's location is known but not visible (DC 11 flat check)
  - `"undetected"` - Subject's location and presence are unknown
- **steps** `number` - Number of steps to increase/decrease visibility (when mode is "increase" or "decrease")
- **applyEphemeralEffects** `boolean` - Whether to apply ephemeral effects for the visibility status.
- **durationRounds** `number` - How many rounds the visibility effect should last.
- **requiresInitiative** `boolean` - Whether the effect requires initiative to be tracked.
- **range** `number` - Maximum range in feet to apply the effect.
- **predicate** `array` - Conditions that must be met for the rule element to apply.

### How It Works

The Visibility rule element establishes a relationship between:
1. A **subject** (who is being seen)
2. **Observers** (who are doing the seeing)
3. A **direction** (which way the visibility effect applies)

When the rule element is active, it applies the specified visibility change based on the direction:
- With `"from"` direction: The subject is hidden FROM the observers (observers see subject)
  - Ephemeral effects are applied to the subject token (the one being seen)
- With `"to"` direction: The subject is hidden TO the observers (subject sees observers)
  - Ephemeral effects are applied to the observer tokens (the ones doing the seeing)

### Examples

#### Hide Yourself (FROM direction)

```json
{
  "key": "Visibility",
  "subject": "self",
  "observers": "all",
  "direction": "from",
  "mode": "set",
  "status": "hidden",
  "applyEphemeralEffects": true,
  "durationRounds": 10
}
```

This rule element makes you hidden to all observers. Ephemeral effects are applied to your token.

#### Conceal a Target (FROM direction)

```json
{
  "key": "Visibility",
  "subject": "target",
  "observers": "all",
  "direction": "from",
  "mode": "set",
  "status": "concealed",
  "applyEphemeralEffects": true,
  "durationRounds": 10
}
```

This rule element makes the targeted token concealed to all observers. Ephemeral effects are applied to the target token.

#### Enhanced Vision (TO direction)

```json
{
  "key": "Visibility",
  "subject": "self",
  "observers": "all",
  "direction": "to",
  "mode": "decrease",
  "steps": 1,
  "applyEphemeralEffects": true,
  "durationRounds": 10
}
```

This rule element improves how you see other creatures (you see them more clearly). Ephemeral effects are applied to your token (the observer).

#### Blur Vision (TO direction)

```json
{
  "key": "Visibility",
  "subject": "target",
  "observers": "all",
  "direction": "to",
  "mode": "increase",
  "steps": 1,
  "applyEphemeralEffects": true,
  "durationRounds": 10
}
```

This rule element makes it harder for the target to see other creatures. Ephemeral effects are applied to the target token (the observer).

#### Gradually Become Less Visible (FROM direction)

```json
{
  "key": "Visibility",
  "subject": "self",
  "observers": "enemies",
  "direction": "from",
  "mode": "increase",
  "steps": 1,
  "applyEphemeralEffects": true,
  "durationRounds": 10
}
```

This rule element makes you one step less visible to enemies (observed → concealed → hidden → undetected). Ephemeral effects are applied to your token.

#### Reveal a Hidden Target (FROM direction)

```json
{
  "key": "Visibility",
  "subject": "target",
  "observers": "all",
  "direction": "from",
  "mode": "decrease",
  "steps": 2,
  "applyEphemeralEffects": true,
  "durationRounds": 10
}
```

This rule element makes the targeted token two steps more visible to all observers. Ephemeral effects are applied to the target token.

### Roll Options

The Visibility rule element adds the following roll options:

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