# GPT-4o Transcribe Upgrade

**Date**: December 17, 2024  
**Commit**: 1a80d21

## Summary

Upgraded subtitle generation from `whisper-1` to `gpt-4o-transcribe` for higher quality transcription.

## Changes Made

### Model Upgrade
- **Old Model**: `whisper-1`
- **New Model**: `gpt-4o-transcribe`

### Benefits of GPT-4o Transcribe

1. **Higher Quality**: Improved accuracy over Whisper
2. **Better Prompting**: Supports GPT-4o style prompts for better context understanding
3. **Improved Accuracy**: Better handling of domain-specific terminology
4. **Reduced Hallucinations**: Less likely to generate incorrect transcriptions from silence/music

### Prompt Improvements

**Old Prompt** (vocabulary hints):
```python
"BluSanta, doctor, lifestyle diseases, allergies, symptoms, preventive measures, 
health, wellness, medication, diet, exercise"
```

**New Prompt** (context-aware):
```python
"The following audio is from BluSanta, a healthcare conversation between an agent 
and a doctor. Topics include lifestyle diseases, allergies, symptoms, preventive 
measures, health, wellness, medication, diet, and exercise. Transcribe accurately 
with proper punctuation."
```

### Technical Details

**Supported Features**:
- ✅ Response formats: `json`, `text`, `verbose_json`
- ✅ Language specification
- ✅ Prompts (GPT-4o style)
- ✅ Log probabilities (logprobs)
- ⚠️ Note: `timestamp_granularities[]` not supported in gpt-4o models (only in whisper-1)

**API Call**:
```python
transcript = openai.audio.transcriptions.create(
    model="gpt-4o-transcribe",
    file=audio_file,
    response_format="verbose_json",
    language=language,
    prompt=context_prompt
)
```

## Files Modified

### [blusanta_zoom_stitch.py](blusanta_zoom_stitch.py)

**Line 55**: Updated function docstring
```python
def generate_subtitles_with_openai(video_path: str, language: str = 'en') -> str:
    """
    Generates subtitles from a video file using OpenAI GPT-4o Transcribe API.
    
    Uses gpt-4o-transcribe model for higher quality transcription compared to whisper-1.
```

**Lines 86-116**: Updated transcription call
- Changed model from `whisper-1` to `gpt-4o-transcribe`
- Improved prompt with full context description
- Updated error handling and logging

**Line 131**: Updated metadata
```python
"Original Script: GPT-4o Transcribe API\n"
```

## Deployment

### Git Repository
```bash
git add blusanta_zoom_stitch.py
git commit -m "Upgrade to gpt-4o-transcribe for higher quality subtitle generation"
git push origin master
```

### VM Deployment
```powershell
.\deploy-to-vm.ps1 -Restart
```

**Status**: ✅ Deployed and service restarted successfully

## Testing Recommendations

1. **Monitor Next Assessment**: Compare subtitle quality with previous assessments
2. **Check Accuracy**: Verify improved handling of medical terminology
3. **Review Logs**: Ensure no API errors with new model
4. **Performance**: Monitor transcription time (may be slightly different)

## Rollback Plan

If issues arise, rollback by:
1. Reverting to commit `02203be` (previous version)
2. Or manually changing `model="gpt-4o-transcribe"` back to `model="whisper-1"`
3. Redeploy with `.\deploy-to-vm.ps1 -Restart`

## API Reference

Full documentation: https://platform.openai.com/docs/api-reference/audio/createTranscription

### Key Differences: whisper-1 vs gpt-4o-transcribe

| Feature | whisper-1 | gpt-4o-transcribe |
|---------|-----------|-------------------|
| Response Formats | json, text, srt, verbose_json, vtt | json, text, verbose_json |
| Timestamp Granularities | ✅ Supported | ❌ Not supported |
| Prompts | ✅ Limited (224 tokens) | ✅ GPT-4o style |
| Log Probabilities | ❌ Not supported | ✅ Supported |
| Quality | Good | Higher |
| Hallucinations | More likely | Less likely |

## Expected Improvements

1. **Medical Terminology**: Better recognition of disease names, medications, symptoms
2. **Punctuation**: More accurate punctuation placement
3. **Context Awareness**: Better understanding of healthcare conversation flow
4. **Hindi Transliteration**: Improved handling of Hindi names in English transcription
5. **Reduced Errors**: Fewer hallucinated words from silence/background

## Cost Considerations

- **whisper-1**: $0.006 per minute
- **gpt-4o-transcribe**: Pricing may vary, check current OpenAI pricing

*Note: Monitor costs after deployment to ensure budget alignment*

---

**Deployment Status**: ✅ Live on production VM  
**Repository**: https://github.com/DIPESHGOEL27/Eris_BluSanta.git  
**Branch**: master  
**Last Updated**: December 17, 2024
