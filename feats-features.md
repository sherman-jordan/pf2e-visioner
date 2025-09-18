# Currently Supported Feats & Features
PF2e Visioner hardcodes accommodations to Pathfinder 2e feats and features that modify the way certain stealth actions work. Below is a running list of those which are currently supported, with a brief description of how module behavior is adjusted. 

Homebrew feats may eventually receive support for similar functionality through the use of custom Rule Elements at later stages of development.

PF2e Visioner does not attempt to enforce movement limits, but does add a reminder of max movement when taking the Sneak action.

### Ceaseless Shadows
Requires [Distracting Shadows](#distracting-shadows)
- Callout added to Hide and Sneak results dialog informing GM validation may be modified by feat
- Within Results dialogs: prerequisites for Hide, End Position prerequisites for Sneak, are ignored for the purpose of validating the roll result.
- Auto cover: Lesser cover granted from another creature is upgraded to standard cover
- Auto cover: Standard cover granted from another creature is upgraded to greater cover

### Distracting Shadows
- Callout added to Hide and Sneak results dialog informing GM requirements may be modified by feat
- Within Hide and Sneak results dialogs: for the purposes of requirements, lesser cover granted by creatures at least one size larger satisfy the requirement

### Legendary Sneak
Requires [Swift Sneak](#swift-sneak)
- Callout added to the Results dialog for both Hide and Sneak alerting the GM that recommendations may be modified by the feat
- Within results dialogs: prerequisites for Hide, and End Position prerequisites for sneak, are ignored for the purpose of validating the roll result.

### Swift Sneak
- Maximum movement in the Start Sneak callout is adjusted to full movement speed.

### Terrain Stalker
Trigger: Token must begin a Sneak within difficult terrain matching their chosen type according to the following chart:

| Scene or Region Environment    | Difficult Terrain Type|
| ------------------------------ | --------------------- |
| Mountain / Underground / Urban | Rubble                |
| Arctic                         | Snow                  |
| Forrest                        | Underbrush            |

- Callout for Start Sneak adjusted to remind player that they will automatically succeed their Sneak so long as they follow the feat prerequisites.
- If feat prerequisites are met, a callout is added to the Sneak Results dialog reminding the GM the recommendations may have changed due to the feat.
- If feat prerequisites are met, recommendations are set to Undetected so long as Start and End Position requirements are met, regardless of Degree of Success.

### Vanish into the Land
Requires/ improves [Terrain Stalker](#terrain-stalker). 
- If feat prerequisites are met, a callout is added to the Sneak Results dialog reminding the GM the recommendations may have changed due to the feat.
- If feat prerequisites are met, recommendations are set to Undetected regardless of any Sneak action prerequisites. The dialog shows the results of checks and roles as normal, but will select Undetected in the absence of an override.

### Very Sneaky
- Maximum movement in the Start Sneak callout adjusted up by 5 ft.
- Technical limitations currently prevent from pushing the check for cover until the end of turn. This element of the feat will need to be adjudicated by the GM.

### Very Very Sneaky
Requires/ improves [Very Sneaky](#very-sneaky)
- Maximum movement in the Start Sneak callout adjusted up to the token's actor's full speed
- Within the Sneak Results dialog, Start Position prerequisites are ignored for the purpose of validating the roll result.