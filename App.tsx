import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Switch,
  Alert,
  I18nManager,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// تفعيل الواجهة من اليمين إلى اليسار (RTL)
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

interface ExtractedMedia {
  videoUrl: string | null;
  subUrl: string | null;
}

export default function App() {
  const [url, setUrl] = useState<string>('');
  const [downloadVideo, setDownloadVideo] = useState<boolean>(true);
  const [downloadSubtitle, setDownloadSubtitle] = useState<boolean>(true);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);

  // دالة تحويل الروابط النسبية إلى روابط مطلقة بشكل ديناميكي
  const resolveUrl = (targetUrl: string, baseUrl: string): string => {
    if (targetUrl.startsWith('//')) {
      return 'https:' + targetUrl;
    }
    if (targetUrl.startsWith('/')) {
      try {
        const urlObj = new URL(baseUrl);
        return `${urlObj.protocol}//${urlObj.host}${targetUrl}`;
      } catch (e) {
        return 'https://movie.vodu.me' + targetUrl;
      }
    }
    return targetUrl;
  };

  // استخراج رابط الفيديو والترجمة من محتوى الصفحة
  const extractMediaUrls = (htmlText: string, baseUrl: string): ExtractedMedia => {
    let videoUrl: string | null = null;
    let subUrl: string | null = null;

    // 1. البحث عن وسم الفيديو و src
    const videoSrcMatch = htmlText.match(/<video[^>]*src=["']([^"']+)["']/i);
    if (videoSrcMatch) {
      videoUrl = videoSrcMatch[1];
    } else {
      // البحث داخل وسم source
      const sourceMatch = htmlText.match(/<source[^>]*src=["']([^"']+)["']/i);
      if (sourceMatch) {
        videoUrl = sourceMatch[1];
      }
    }

    // البحث عن روابط MP4 عبر Regex في حالة عدم العثور عليها في الوسوم
    if (!videoUrl) {
      const mp4Matches = htmlText.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi);
      if (mp4Matches && mp4Matches.length > 0) {
        videoUrl = mp4Matches[0];
      }
    }

    // 2. استخراج رابط الترجمة
    const trackMatch = htmlText.match(/<track[^>]*src=["']([^"']+)["'][^>]*kind=["'](?:subtitles|captions)["']/i) 
                      || htmlText.match(/<track[^>]*kind=["'](?:subtitles|captions)["'][^>]*src=["']([^"']+)["']/i);
    
    if (trackMatch) {
      subUrl = trackMatch[1];
    } else {
      const subMatches = htmlText.match(/https?:\/\/[^\s"'<>]+\.(?:vtt|srt)[^\s"'<>]*/gi);
      if (subMatches && subMatches.length > 0) {
        subUrl = subMatches[0];
      }
    }

    return {
      videoUrl: videoUrl ? resolveUrl(videoUrl, baseUrl) : null,
      subUrl: subUrl ? resolveUrl(subUrl, baseUrl) : null,
    };
  };

  const handleDownload = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      Alert.alert('تنبيه', 'يرجى إدخال رابط الحلقة أولاً.');
      return;
    }

    if (!downloadVideo && !downloadSubtitle) {
      Alert.alert('تنبيه', 'يرجى اختيار عنصر واحد على الأقل للتحميل (فيديو أو ترجمة).');
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatusMessage('جاري جلب بيانات الصفحة...');

    try {
      // 1. جلب محتوى الصفحة
      const response = await fetch(trimmedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`تعذر الاتصال بالموقع (${response.status})`);
      }

      const htmlText = await response.text();
      const media = extractMediaUrls(htmlText, trimmedUrl);

      if (!media.videoUrl && downloadVideo) {
        throw new Error('لم يتم العثور على رابط الفيديو في هذه الصفحة.');
      }

      // 2. تنزيل الفيديو
      let downloadedVideoUri = '';
      if (downloadVideo && media.videoUrl) {
        let videoName = media.videoUrl.split('/').pop()?.split('?')[0] || 'video.mp4';
        if (!videoName.endsWith('.mp4')) videoName += '.mp4';

        setStatusMessage(`جاري تحميل الفيديو: ${videoName}`);

        const fileUri = FileSystem.documentDirectory + videoName;
        const downloadResumable = FileSystem.createDownloadResumable(
          media.videoUrl,
          fileUri,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          },
          (downloadProgress) => {
            const progressPercent =
              downloadProgress.totalBytesWritten /
              downloadProgress.totalBytesExpectedToWrite;
            if (!isNaN(progressPercent)) {
              setProgress(Math.round(progressPercent * 100));
            }
          }
        );

        const result = await downloadResumable.downloadAsync();
        if (result?.uri) {
          downloadedVideoUri = result.uri;
        }
      }

      // 3. تنزيل الترجمة
      let downloadedSubUri = '';
      if (downloadSubtitle) {
        if (media.subUrl) {
          setStatusMessage('جاري تحميل ملف الترجمة...');
          const subExt = media.subUrl.split('.').pop()?.split('?')[0] || 'vtt';
          const subName = `subtitle_${Date.now()}.${subExt}`;
          const subFileUri = FileSystem.documentDirectory + subName;

          const subDownload = await FileSystem.downloadAsync(
            media.subUrl,
            subFileUri
          );
          downloadedSubUri = subDownload.uri;
        } else {
          setStatusMessage('ملاحظة: الترجمة غير متوفرة لهذه الحلقة.');
        }
      }

      setStatusMessage('اكتمل التنزيل بنجاح!');
      setProgress(100);

      // مشاركة وحفظ الملف في الهاتف
      const targetUri = downloadedVideoUri || downloadedSubUri;
      if (targetUri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(targetUri);
      } else {
        Alert.alert('تم النجاح', 'تم حفظ الملف بنجاح داخل الهاتف.');
      }

    } catch (error: any) {
      setStatusMessage(`خطأ: ${error.message || 'حدث خطأ غير متوقع'}`);
      Alert.alert('فشل العملية', error.message || 'تعذر استكمال التحميل.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>مُحمل الحلقات والترجمة</Text>
        <Text style={styles.subtitle}>أدخل رابط الحلقة للبدء في التحميل</Text>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="أدخل رابط الحلقة هنا..."
            placeholderTextColor="#888"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            editable={!loading}
          />
        </View>

        <View style={styles.optionsContainer}>
          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>تحميل الفيديو (.mp4)</Text>
            <Switch
              value={downloadVideo}
              onValueChange={setDownloadVideo}
              disabled={loading}
              trackColor={{ false: '#333', true: '#007ACC' }}
            />
          </View>

          <View style={styles.optionRow}>
            <Text style={styles.optionLabel}>تحميل الترجمة (.vtt / .srt)</Text>
            <Switch
              value={downloadSubtitle}
              onValueChange={setDownloadSubtitle}
              disabled={loading}
              trackColor={{ false: '#333', true: '#007ACC' }}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleDownload}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>بدء التحميل</Text>
          )}
        </TouchableOpacity>

        {statusMessage ? (
          <View style={styles.statusBox}>
            <Text style={styles.statusText}>{statusMessage}</Text>
            {loading && progress > 0 && (
              <Text style={styles.progressText}>التقدم: {progress}%</Text>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContainer: {
    padding: 20,
    alignItems: 'stretch',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#AAA',
    textAlign: 'center',
    marginBottom: 30,
    marginTop: 5,
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
    textAlign: 'right',
  },
  optionsContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  optionRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  optionLabel: {
    color: '#FFF',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#007ACC',
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    backgroundColor: '#444',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusBox: {
    marginTop: 25,
    padding: 15,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  statusText: {
    color: '#DDD',
    textAlign: 'center',
    fontSize: 14,
  },
  progressText: {
    color: '#007ACC',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: 'bold',
  },
});
