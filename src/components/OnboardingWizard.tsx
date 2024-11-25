"use client";

import { useState } from "react";
import StepOne, { StepOneFormSchema } from "./StepOne";
import StepThree, { StepThreeFormSchema } from "./StepThree";
import StepTwo, { StepTwoFormSchema } from "./StepTwo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

const API_BASE_URL = import.meta.env.VITE_API_URL;

type UserDataSchema = Partial<
  StepOneFormSchema & StepTwoFormSchema & StepThreeFormSchema
>;

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [userData, setUserData] = useState<UserDataSchema>({});

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
  };

  const handlePrevious = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmitData = async (data: any, step: number) => {
    // Do something with the data
    setUserData((prevData) => ({
      ...prevData,
      ...data,
    }));

    console.log(`Datos acumulados después del paso ${step}:`, {
      ...userData,
      ...data, // Esto refleja los datos combinados
    });

    // Move to next step
    handleNext();

    // Final step
    if (step === 3) {
      // SUBMITTING FINAL DATA
      console.log("Submitting Final Data");
      console.log({ userData });

      try {
        // Call the API with the final data
        const response = await fetch(`${API_BASE_URL}/api/createFile`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...userData, ...data }),
        });

        // Handle the response
        if (!response.ok) {
          throw new Error("Error sending data to the API");
        }

        const result = await response.json();
        console.log("API response:", result);
      } catch (error) {
        console.error("Error calling the API:", error);
      }
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Asterisk Daily Check</CardTitle>
        <CardDescription>Step {step} of 4</CardDescription>
      </CardHeader>
      <CardContent>
        {step === 0 && <WelcomeMessage />} // Step 0: Welcome Message
        {step === 1 && (
          <StepOne
            handleSubmitData={(data) => handleSubmitData(data, 1)}
            handleBack={handlePrevious}
          />
        )}
        {step === 2 && (
          <StepTwo
            handleSubmitData={(data) => handleSubmitData(data, 2)}
            handleBack={handlePrevious}
          />
        )}
        {step === 3 && (
          <StepThree
            handleSubmitData={(data) => handleSubmitData(data, 3)}
            handleBack={handlePrevious}
          />
        )}
      </CardContent>
    </Card>
  );
}

// New WelcomeMessage component
function WelcomeMessage() {
  return <h2>Welcome to the Onboarding Wizard!</h2>;
}
