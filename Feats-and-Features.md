# Currently Supported Feats & Features
PF2e Visioner hardcodes accommodations for Pathfinder 2e feats and features that modify the way certain stealth actions work. Below is a running list of those which are currently supported, along with a brief description of how module behavior is adjusted. For a full description of how a given feat works within the context of Pathfinder 2e RAW, please refer to the official books or to [AoN Pathfinder 2e SRD](https://2e.aonprd.com/Feats.aspx).

Homebrew feats may eventually receive support for similar functionality through the use of custom Rule Elements at later stages of development.


> [!IMPORTANT]
> Feats that require or upgrade other feats as prerequisites are marked as such to make them easier to follow; however, the module does not enforce these prerequisites.
>
> PF2e Visioner does not attempt to enforce movement limits, but does add a reminder of max movement when taking the Sneak action.

### Camouflage
- Informative text added to Hide and Sneak Results dialogs informing GM validation may be modified by feat
- Within Results dialogs: prerequisites for Hide, End Position prerequisites for Sneak, are ignored for the purpose of validating the roll result.

### Ceaseless Shadows
Requires [Distracting Shadows](#distracting-shadows)
- Chip added to Hide and Sneak Results dialog informing GM validation may be modified by feat
- Within Results dialogs: prerequisites for Hide, End Position prerequisites for Sneak, are ignored for the purpose of validating the roll result.
- Auto cover: Lesser cover granted from another creature is upgraded to standard cover
- Auto cover: Standard cover granted from another creature is upgraded to greater cover

### Distracting Shadows
- Chip added to Hide and Sneak Results dialog informing GM requirements may be modified by feat
- Within Hide and Sneak results dialogs: for the purposes of requirements, lesser cover granted by creatures at least one size larger satisfy the requirement

### Keen Eyes
- Adds a +2 bonus to Seek results made against targets that have Hidden or Undetected Visioner states vs the Seeker
- pf2e system has an RE for this, but it only works against targets that have the blanket condition

### Legendary Sneak
Requires [Swift Sneak](#swift-sneak)
- Chip added to Hide and Sneak Results dialog informing GM that recommendations may be modified by feat
- Within results dialogs: prerequisites for Hide, and End Position prerequisites for sneak, are ignored for the purpose of validating the roll result.

## Sneaky
- Maximum movement in the Start Sneak callout and Sneak Results chip are adjusted up by 5 ft.
- A new row of buttons is added to the Sneak Results Dialog, allowing the GM to defer End Position validation. This enables multiple Sneak actions that are taken in sequence to ignore the concealment or cover requirement for end position, until the final Sneak action / end of turn.
- A new dialog box for end-of-turn position validation is added, allowing the Gm to validate the movement end prerequisites for a chain of Sneak actions taken in a turn.

### Swift Sneak
- Maximum movement in the Start Sneak callout and Sneak Results chip are adjusted to full movement speed.

### Terrain Stalker
Trigger: Token begins a Sneak within difficult terrain matching their chosen type according to the following chart:

| Scene or Region Environment    | Difficult Terrain Type|
| ------------------------------ | --------------------- |
| Mountain / Underground / Urban | Rubble                |
| Arctic                         | Snow                  |
| Forrest                        | Underbrush            |

- Callout for Start Sneak adjusted to remind player that they will automatically succeed their Sneak so long as they follow the feat prerequisites.
- If feat prerequisites are met, a chip is added to the Sneak Results dialog reminding the GM the recommendations may have changed due to the feat.
- If feat prerequisites are met, recommendations are set to Undetected so long as Start and End Position requirements are met, regardless of Degree of Success.

### That's Odd
>> [NOTE!]
>> We may be revising or removing the way this feat functions if we determine it doesn't quite fit the spirit of the Paizo description as written

- All Seek Actions performed within range of an anomaly (Loot Token, Trap Token, or Visioner Hidden Wall) are treated as success

### Vanish into the Land
Requires/ improves [Terrain Stalker](#terrain-stalker). 
- If feat prerequisites are met, a chip is added to the Sneak Results dialog reminding the GM the recommendations may have changed due to the feat.
- If feat prerequisites are met, recommendations are set to Undetected regardless of any Sneak action prerequisites. The dialog shows the results of checks and roles as normal, but will select Undetected in the absence of an override.

### Very Sneaky
- Maximum movement in the Start Sneak callout and Sneak Results chip are adjusted up by 5 ft.
- A new row of buttons is added to the Sneak Results Dialog, allowing the GM to defer End Position validation. This enables multiple Sneak actions that are taken in sequence to ignore the concealment or cover requirement for end position, until the final Sneak action / end of turn.
- A new dialog box for end-of-turn position validation is added, allowing the Gm to validate the movement end prerequisites for a chain of Sneak actions taken in a turn.

### Very Very Sneaky
Requires/ improves [Very Sneaky](#very-sneaky)
- Maximum movement in the Start Sneak callout and Sneak Results chip are adjusted up to the token's actor's full speed
- Within the Sneak Results dialog, Start Position prerequisites are ignored for the purpose of validating the roll result.