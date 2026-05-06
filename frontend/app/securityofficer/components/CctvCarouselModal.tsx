import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { GestureHandlerRootView, PinchGestureHandler, State } from "react-native-gesture-handler";
import Text from "../../../components/TranslatedText";

type CctvCarouselModalProps = {
  visible: boolean;
  images: Array<string | null>;
  initialIndex?: number;
  onClose: () => void;
};

const MAX_SCALE = 4;

export default function CctvCarouselModal({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: CctvCarouselModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scaleBase = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const lastScale = useRef(1);

  const safeImages = useMemo(() => (images.length ? images : [null, null, null, null]), [images]);

  useEffect(() => {
    if (!visible) return;
    const nextIndex = clampIndex(initialIndex, safeImages.length);
    setActiveIndex(nextIndex);
  }, [initialIndex, safeImages.length, visible]);

  useEffect(() => {
    lastScale.current = 1;
    scaleBase.setValue(1);
    pinchScale.setValue(1);
  }, [activeIndex, visible, pinchScale, scaleBase]);

  const onPinchEvent = Animated.event([{ nativeEvent: { scale: pinchScale } }], {
    useNativeDriver: true,
  });

  const onPinchStateChange = (event: { nativeEvent: { oldState: number; scale: number } }) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    let nextScale = lastScale.current * event.nativeEvent.scale;
    nextScale = clamp(nextScale, 1, MAX_SCALE);
    lastScale.current = nextScale;
    scaleBase.setValue(nextScale);
    pinchScale.setValue(1);
  };

  const imageScale = Animated.multiply(scaleBase, pinchScale);
  const hasMultiple = safeImages.length > 1;
  const activeUri = safeImages[activeIndex] ?? null;

  const goPrev = () => setActiveIndex((prev) => clampIndex(prev - 1, safeImages.length));
  const goNext = () => setActiveIndex((prev) => clampIndex(prev + 1, safeImages.length));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.backdrop}>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>

          <View style={styles.headerRow}>
            <Text style={styles.title}>CCTV Image</Text>
            <Text style={styles.counterText}>{`${activeIndex + 1} / ${safeImages.length}`}</Text>
          </View>

          <View style={styles.viewer}>
            <View style={styles.imageShell}>
              <PinchGestureHandler onGestureEvent={onPinchEvent} onHandlerStateChange={onPinchStateChange}>
                <Animated.View style={styles.imageWrap}>
                  {activeUri ? (
                    <Animated.Image
                      source={{ uri: activeUri }}
                      style={[styles.image, { transform: [{ scale: imageScale }] }]}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={styles.placeholder}>
                      <Text style={styles.placeholderText}>No CCTV image available</Text>
                    </View>
                  )}
                </Animated.View>
              </PinchGestureHandler>

              {hasMultiple ? (
                <>
                  <Pressable style={[styles.navBtn, styles.navLeft]} onPress={goPrev}>
                    <ChevronLeft size={20} color="#FFFFFF" />
                  </Pressable>
                  <Pressable style={[styles.navBtn, styles.navRight]} onPress={goNext}>
                    <ChevronRight size={20} color="#FFFFFF" />
                  </Pressable>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampIndex(nextIndex: number, length: number) {
  if (length <= 0) return 0;
  if (nextIndex < 0) return length - 1;
  if (nextIndex >= length) return 0;
  return nextIndex;
}

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 16, 30, 0.92)",
    paddingHorizontal: 16,
    paddingTop: 30,
  },
  closeBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  headerRow: {
    marginTop: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
  },
  counterText: {
    color: "#C7D2FE",
    fontSize: 12,
    fontWeight: "700",
  },
  viewer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imageShell: {
    position: "relative",
    width: Math.min(screenWidth - 32, 520),
    height: Math.min(screenHeight * 0.72, 520),
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: Math.min(screenWidth - 32, 520),
    height: Math.min(screenHeight * 0.72, 520),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0B1F3A",
    borderRadius: 16,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  placeholderText: {
    color: "#CBD5F5",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  navBtn: {
    position: "absolute",
    top: "50%",
    marginTop: -20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: "#000000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  navLeft: {
    left: 8,
  },
  navRight: {
    right: 8,
  },
});
