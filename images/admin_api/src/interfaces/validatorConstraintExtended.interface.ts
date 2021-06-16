import { ValidatorConstraintInterface } from "class-validator";

interface IValidatorConstraintInterfaceExtended extends ValidatorConstraintInterface {
  notValidItemsArray: string[];
}

export default IValidatorConstraintInterfaceExtended;
