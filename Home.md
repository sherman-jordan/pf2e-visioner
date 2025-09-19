> [!CAUTION]
> Please be aware that this wiki is being built for the 4.0.0 version of pf2e Visioner - which is currently in alpha!
>
> There is no wiki for the current production branch. Information contained within may reference features not yet available or describe processes which are slated for change from your current version.
> 
> You may reach out to the [pf2e Visioner thread on discord](https://discord.com/channels/880968862240239708/1400679723427823626) if you have questions or concerns 

# Overview
PF2e Visioner is a comprehensive suite of tools that provides GMs and players a high level of control over relational vision and cover in the Pathfinder 2e system for Foundry. Visioner is designed to greatly improve the quality of life for GMs and players who interact with stealth and cover mechanics to a high degree. In addition to tracking degrees of observation and cover between individual tokens, the module introduces powerful automated systems for both cover and vision to significantly streamline the process of applying effects that interact with the PF2e system.

## Important Note Regarding Automation:
PF2e Visioner's fully automated subsystems use information hard-coded into the world, such as walls and lighting on a scene, as well as actor traits and effects, to determine vision states and cover for tokens as their positions and ambient conditions change.

These systems are easily toggled off and are designed to be as easy to override as possible. We realize that no scene can be pre-hardcoded with all the information needed to replace the creative interpretation of a map and GM discretion. The automation systems are designed to provide recommended rules-informed baseline values to save GMs even more time and effort managing visibility and cover - they are not intended to replace the adjudication process entirely.

While GMs are more than welcome to accept auto-cover and AVS data unconditionally at times to expedite and streamline gameplay, please recognize the trade-off: the algorithm may not fully consider all the conditions in your imaginary world. We ask you to consider this both as you play and in bug-reporting and feature requests. 

# Glossary of Terms:
The following internal terminology may prove useful to advanced users:

- **Auto-Cover:** The subsystem of Visioner which uses tokens and walls to apply conditional cover relationships between tokens without manual intervention. When enabled, tokens' relative degree of cover from one another is determined and updated by the module as they move through the scene. There are several ways to manually adjust relative cover states granted by the system, as needed.

- **AVS:** Automated Visibility System. AVS is the subsystem the module uses to automatically update the state of visibility between token-pairs. It considers conditions and effects on the actor, line of sight, and conditions on the scene, such as lighting - generally to toggle between `Observed` and `Concealed` where applicable.

- **Foundry-Hidden:** The internal mechanism Foundry VTT uses to flag tokens not to be drawn on player canvas. This does *not* refer to the pf2e system condition of `Hidden`. Tokens that are Foundry-Hidden are neither visible nor interactable by users who don't have Gamemaster or Assistant Gamemaster user roles and are skipped over by AVS in order to save calculations. 

- **Foundry-Invisible:** When the module uses a flag or effect on a token to tell Foundry not to draw that token on one or more player canvases. Like Foundry-Hidden, this does not refer to invisibility in the context of the system condition. Whereas Foundry-Hidden is a core feature that affects all non-GM users, flags and effects can be used in more flexible ways when specific contexts require it. Example: tokens are made Foundry-Invisible to all tokens for whom they are `Undetected`.

- **Observer:** Within a token-pair, the observer is the token observing a target.

- **Override (AVS):** AVS is capable of determining fully observed or concealed statuses based on ambient conditions, actor senses, and pf2e conditions; however, it is frequently necessary to explicitly upgrade or downgrade degrees of observation due to actions taken or for GM-determined reasons. These state changes, whether set manually by the GM in the Token Manager, or from accepting Visioner recommendations from an action, are stored in flags on the target token as an override value which supersedes AVS. AVS uses an override manager to remind GMs of overrides that may no longer be pertinent due to token movement or other triggers.

- **Override Manager:** GUI dialog comprised of a floating indicator button and a corresponding dialog. When token movement or line of sight changes in a way which may warrant removing an AVS override, this system allows visibility states to be quickly turned back over to AVS. Visioner won't ever perform this automatically, because removing more restrictive degrees of cover before the GM is ready could be extremely disruptive to immersion.

- **Recommendation:** Module-derived suggestions for upgrading or downgrading visibility or cover states, or for removing AVS overrides. 

- **Target:** Within a token-pair, the target is the token being observed. This is not to be confused with a targeted token within Foundry, or the target of an action within pf2e. When Foundry or gameplay targets are spoken of in the wiki, we may say visibility-target or cover-target for the purpose of disambiguation.

- **Token-Pair:** A single conditional relationship between two tokens with regard to visibility or cover.

- **Visioner Manager:** Main UI Dialog that can be called up by GM-role users at any time. It shows and manages booth visibility and cover token-pair relationships.  

- **Quick Edit:** Streamlined dialog used to quickly manage vision and cover for a single token pair between a selected token and a targeted token in Foundry.