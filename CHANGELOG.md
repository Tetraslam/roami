# Changelog

## [Unreleased]

### Current Codebase Structure

#### App (`/src/app`)
- Root layout with dark theme and global styles
- Simplified page.tsx to redirect to passenger mode
- Clean routing structure focusing on passenger experience

#### Components (`/src/components`)
- **Header**: Minimalist design with app branding
  - Fixed positioning with blur effect
  - Dark theme compatible
  - Responsive layout
- **ControlButtons**: Core UI controls
  - Voice recording button with state feedback
  - Image capture button (placeholder functionality)
  - Mobile-first design with full-width buttons
- **ChatInterface**: Message display component
  - Supports user and AI message types
  - Handles both text and image content
  - Scrollable interface with proper spacing

#### Hooks (`/src/hooks`)
- **usePassengerVoiceRecording**: Core voice recording functionality
  - Manual recording control
  - Error handling and state management
  - Transcript collection and processing
  - Cleanup on unmount
  - Event handling for speech recognition

#### Types (`/src/types`)
- **speech.d.ts**: TypeScript declarations
  - Web Speech API type definitions
  - Custom type extensions for voice recording
  - Message interface definitions

#### Styles (`/src/styles`)
- **design-tokens.ts**: Design system foundation
  - Dark theme color palette
  - Typography scale
  - Spacing system
  - Animation tokens
  - Shadow definitions

### Recent Changes
- Migrated page.tsx to a redirect-only component
- Simplified component hierarchy
- Improved type safety across components
- Enhanced error handling in voice recording
- Streamlined UI for better user experience

### Technical Implementation Details
1. **Voice Recording System**:
   - Manual control with clear state indicators
   - Proper cleanup and resource management
   - Error boundary implementation
   - State management via React hooks

2. **UI/UX Improvements**:
   - Consistent dark theme implementation
   - Responsive layout with mobile-first approach
   - Smooth transitions and loading states
   - Proper spacing and typography hierarchy

3. **Type Safety**:
   - Comprehensive TypeScript coverage
   - Custom type definitions for external APIs
   - Strict prop typing for components
   - Proper interface definitions

### Next Steps
1. **Voice Recording Enhancement**:
   - Add visual feedback for recording state
   - Implement proper error recovery
   - Add support for longer recordings
   - Improve transcript accuracy

2. **UI/UX Improvements**:
   - Add loading states for async operations
   - Enhance error message display
   - Implement proper image handling
   - Add animation for state transitions

3. **Technical Debt**:
   - Add comprehensive error boundaries
   - Implement proper testing suite
   - Add accessibility improvements
   - Optimize bundle size

### Known Issues
- Voice recording may end prematurely in some cases
- Image capture functionality is placeholder only
- Some UI elements need proper loading states
- Error messages need better formatting

### Changed
- Simplified application to focus solely on passenger mode
- Removed driver mode and related components
- Streamlined header and control components
- Updated routing to only handle passenger mode

### Voice Recording Implementation
- Successfully implemented manual voice recording in passenger mode with the following key insights:
  1. **State Management**:
     - Use refs (`transcriptRef`) instead of state for transcript collection
     - Avoid storing transcript in state to prevent unnecessary re-renders
     - Keep recording state minimal (just `isRecording`, `error`, and `recognition`)

  2. **Common Pitfalls Avoided**:
     - Don't use `continuous = false` as it auto-stops after silence
     - Don't update state on every `onresult` event to avoid UI jank
     - Don't send transcript multiple times during recording session

  3. **Best Practices**:
     - Clear transcript at the start of each new recording session
     - Only send complete transcript when manually stopped
     - Proper cleanup on unmount

  4. **Error Handling**:
     - Ignore 'no-speech' errors as they're common and non-critical
     - Properly cleanup resources on error
     - Maintain recording state even if recognition ends unexpectedly

### Technical Details
- Set up project structure with frontend directory
- Implemented dark theme color scheme
- Created design tokens system
- Added smooth transitions and animations
- Improved accessibility with proper contrast ratios
- Added TypeScript declarations for Web Speech API

### Fixed
- Resolved voice recording issues:
  - Fixed auto-stopping issue by using continuous mode with manual control
  - Fixed duplicate transcript sends by using ref-based collection
  - Fixed React key warnings by removing transcript from state
  - Improved error handling and cleanup in voice recording hook

### Next Steps
1. Implement camera functionality for image capture
2. Configure Firebase for:
   - Authentication
   - Firestore (user data, trip history, conversations)
   - Storage (images)
3. Set up FastAPI backend and deploy to Render
4. Integrate AI services:
   - Cerebras for text processing
   - Moondream for image analysis
5. Implement core passenger features:
   - Roadtrip assistant functionality
   - Location services
   - Tour guide features

### Technical Debt / Future Improvements
- Add fallback for browsers that don't support Web Speech API
- Add visual feedback for microphone permissions
- Add support for multiple languages 