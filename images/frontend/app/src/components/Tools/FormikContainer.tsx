import { FC } from "react";
import { Formik, Form } from 'formik';
import * as Yup from 'yup';



const FormikContainer: FC<{}> = () => {
    const initialValues = {};
    const validationSchema = Yup.object({});
    const onSubmit = (values: {}, actions: any) => console.log("Form data= ", { values, actions });

    return (
        <Formik initialValues={initialValues} validationSchema={validationSchema} onSubmit={onSubmit} >
            {
                formik => (
                    <Form>
                        <button type='submit'>Submit</button>
                    </Form>
                )
            }

        </Formik>
    )
}

export default FormikContainer;
