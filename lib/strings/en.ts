/**
 * English translation layer — typed against ko (the source of truth).
 * `Record<keyof typeof ko, string>` makes completeness a COMPILE-TIME
 * guarantee: adding a ko key without its en twin fails tsc.
 */
import { type ko } from '@/lib/strings/ko';

export const en: Record<keyof typeof ko, string> = {
  'common.cancel': 'Cancel',
  'common.later': 'Later',
  'common.retry': 'Retry',
  'common.delete': 'Delete',
  'common.openSettings': 'Open Settings',
  'common.freeRun': 'Free run',

  'date.today': 'Today',
  'date.yesterday': 'Yesterday',

  'title.dawn': 'Dawn Run',
  'title.morning': 'Morning Run',
  'title.forenoon': 'Late Morning Run',
  'title.lunch': 'Lunch Run',
  'title.afternoon': 'Afternoon Run',
  'title.evening': 'Evening Run',
  'title.night': 'Night Run',

  'vis.public': 'Public',
  'vis.publicSub': 'Visible on feed and profile',
  'vis.followers': 'Followers only',
  'vis.followersSub': 'Only followers can see this',
  'vis.private': 'Private',
  'vis.privateSub': 'Only you can see this',

  'runSave.title': 'Save Run',
  'runSave.save': 'Save',
  'runSave.gpsCaption': 'GPS tracked',
  'runSave.crewTag.before': 'Recorded as a ',
  'runSave.crewTag.after': ' crew run',
  'runSave.crewMeeting': "'{title}' meetup",
  'runSave.tagRemoved': 'Not recorded as a crew run',
  'runSave.undo': 'Undo',
  'runSave.statDist': 'Distance',
  'runSave.statTime': 'Time',
  'runSave.statPace': 'Pace',
  'runSave.addPhoto': 'Add photos',
  'runSave.memoPlaceholder': 'How was your run? Leave a note...',
  'runSave.visibility': 'Visibility',
  'runSave.tooShort': 'Runs this short are not saved',
  'runSave.deleteRun': 'Delete this run',
  'runSave.discardTitle': 'Delete this run?',
  'runSave.discardSub': 'This run will be discarded, not saved.',
  'runSave.photoFailTitle': 'Could not add photos',
  'runSave.photoFailBody': 'Failed to load the photos. Please try again.',
  'runSave.cameraPermTitle': 'Camera access needed',
  'runSave.cameraPermBody': 'Allow camera access to take running photos.',
  'runSave.shootFailTitle': 'Could not take photo',
  'runSave.shootFailBody': 'Failed to take the photo. Please try again.',
  'runSave.saveFailTitle': 'Save failed',
  'runSave.saveFailBody': 'Please try again in a moment',
};
