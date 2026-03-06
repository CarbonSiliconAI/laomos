# Fiction Writer Skill - Analysis Criteria Document

## 1. Performance Metrics to Track

### Execution Metrics
- **File Save Success Rate**: Percentage of stories successfully saved to user's personal folder
- **XML Tag Format Compliance**: Adherence to required `<save_file>` tag format without code blocks
- **Filename Generation Accuracy**: Percentage of filenames properly formatted with `.txt` extension
- **Response Time**: Duration from prompt receipt to story completion and file save
- **Token Efficiency**: Average tokens consumed per story generated

### Content Metrics
- **Story Completion Rate**: Percentage of prompts resulting in full, finished stories (not truncated)
- **Word Count Consistency**: Average story length and variance from expected range (target: 300-1500 words)
- **Prompt Relevance Score**: Degree to which output addresses the user's provided concept/prompt

## 2. Quality Criteria for Outputs

### Creative Quality
- **Originality**: Story demonstrates unique narrative elements, not generic templates
- **Character Development**: Presence of believable, distinct characters with motivations
- **Plot Coherence**: Clear narrative arc with beginning, middle, and end
- **Dialogue Quality**: Natural, purposeful character dialogue (if applicable)
- **Descriptive Language**: Vivid sensory details and appropriate literary devices

### Technical Quality
- **Grammar & Spelling**: Error-free prose with proper punctuation
- **Formatting Compliance**: Proper use of title, author attribution, and story body
- **Metadata Accuracy**: Generated filename reflects story content appropriately
- **File Structure Integrity**: Valid XML tag structure that OS can parse and save

### User Experience Quality
- **Prompt Interpretation**: Accurate understanding of user's creative intent
- **Tone Appropriateness**: Story tone matches prompt expectations
- **Conversational Message Quality**: Clear, friendly confirmation message before file tag
- **Accessibility**: Story is readable and engaging for general audiences

## 3. Success/Failure Indicators

### Success Indicators
✓ File successfully saves to user's personal folder  
✓ XML tag format is exactly correct (no code blocks)  
✓ Filename is descriptive, relevant, and ends in `.txt`  
✓ Story is complete and coherent (minimum 200 words)  
✓ Content directly addresses the user's prompt  
✓ Zero grammar/spelling errors in final output  
✓ User provides positive feedback or requests follow-up stories  
✓ Metadata (title, author) are properly formatted  

### Failure Indicators
✗ File save fails or path is invalid  
✗ XML tag is wrapped in code blocks (markdown violation)  
✗ Filename missing `.txt` extension or contains invalid characters  
✗ Story is incomplete, truncated, or incoherent  
✗ Output ignores or misinterprets user's prompt  
✗ Multiple grammar/spelling errors present  
✗ Conversational message is missing or unclear  
✗ Story is generic, repetitive, or lacks originality  
✗ User reports file not saved to intended location  

## 4. Optimization Targets

### Short-term Targets
- **100% XML Format Compliance**: Eliminate all code block violations
- **95%+ File Save Success**: Achieve near-perfect save reliability
- **Zero Critical Errors**: Eliminate grammar/spelling mistakes in final output
- **Prompt Adherence Score >90%**: Consistently address user intent

### Medium-term Targets
- **Reduce Response Time by 20%**: Optimize story generation speed without quality loss
- **Increase Average Story Length to 800 words**: Generate richer, more developed narratives
- **Improve Originality Score to 85%+**: Move beyond template-based storytelling
- **Achieve 90%+ User Satisfaction**: Establish consistent positive feedback

### Long-term Targets
- **Develop Genre Specialization**: Offer distinct quality across multiple story genres
- **Build Story Series Capability**: Enable multi-part narrative continuity
- **Enhance Customization Options**: Support user preferences for tone, length, style
- **Establish Benchmark Library**: Create reference quality standards for different story types

## 5. Benchmark Test Cases

### Test Case 1: Contemporary Realistic Fiction
**Input Prompt**: "Write a story about a person discovering an old letter in their grandmother's attic that changes everything they thought they knew about their family."

**Success Criteria**